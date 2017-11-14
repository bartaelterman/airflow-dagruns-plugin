import json
import logging
import pprint
from airflow import settings
from airflow.plugins_manager import AirflowPlugin
from airflow.models import DagRun, DagModel, DAG
from datetime import datetime, date, timedelta
from flask import Blueprint, request
from flask_admin import BaseView, expose

def _get_end_date(dag_run):
    tasks = dag_run.get_task_instances()
    if len(tasks) > 0:
        # print(tasks)
        end_dates = [x.end_date if x.end_date else datetime.now() for x in tasks]
        return sorted(end_dates)[-1].isoformat() + 'Z'
    return dag_run.start_date.isoformat('T') + 'Z'


class DagRunsView(BaseView):
    @expose('/')
    def test(self):

        # if request.method == 'POST':
        #     request_data = request.get_json(force=True).get('uri')

        today = date.today()
        first_day = today - timedelta(days=8)
        session = settings.Session()

        # this query only works on MySQL as it uses MySQL variables.
        # For postgres you should be able to use a window function which is much cleaner
        session.execute('SET @row_number:=0')
        session.execute("SET @dag_run:=''")
        mysql_query = """
        SELECT * FROM
        (
            SELECT @row_number:=CASE WHEN @dag_run=id THEN @row_number+1 ELSE 1 END AS row_number
             ,@dag_run:=id AS run_id,
             dag_id, execution_date, start_date, end_date, task_id, state
            FROM 
              (
                  SELECT d.id, d.dag_id, d.execution_date, t.task_id, d.start_date, t.end_date, d.state
                  FROM dag_run d
                  LEFT JOIN task_instance t
                    ON d.dag_id=t.dag_id
                    AND d.execution_date=t.execution_date
                  WHERE d.execution_date > :min_date
                  ORDER BY d.dag_id ASC, d.execution_date ASC, t.end_date IS NULL DESC, t.end_date DESC
              ) dag_tasks
        ) dag_tasks_numbered
        WHERE row_number=1
        """

        result = session.execute(mysql_query,
            {'min_date': first_day.isoformat(), 'today': date.today().isoformat()}
        )
        logging.warning('RESULT FROM QUERY:')
        if result.rowcount > 0:
            records = result.fetchall()
            logging.warning(records)
            dag_runs = [
                 {
                    'dagId': run['dag_id'],
                    'startDate': run['start_date'].isoformat('T') + 'Z',
                    'endDate': run['end_date'].isoformat('T') + 'Z' if run['end_date'] else datetime.now().isoformat('T') + 'Z',
                    'executionDate': run['execution_date'].isoformat() + '.000Z',
                    'executionDateStr': run['execution_date'].strftime("%Y-%m-%d %H:%M:%S"),
                    'schedule': 'unknown',  # TODO: how can we get the scheduled interval
                    'state': run['state']
                } for run in records]
        else:
            logging.warning('No records found')
            dag_runs = []

        return self.render("dag_runs.html", dag_runs=json.dumps(dag_runs))


v = DagRunsView(name="DAG runs plugin")


# Creating a flask blueprint to intergrate the templates and static folder
bp = Blueprint(
    "dagruns_plugin", __name__,
    template_folder='templates', # registers airflow/plugins/templates as a Jinja template folder
    static_folder='static',
    static_url_path='/static/dagruns')


# Defining the plugin class
class DagRunsPlugin(AirflowPlugin):
    name = "dagruns_plugin"
    admin_views = [v]
    flask_blueprints = [bp]
