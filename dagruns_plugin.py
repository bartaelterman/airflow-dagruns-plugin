import json
import pickle
import pprint
from airflow import settings
from airflow.plugins_manager import AirflowPlugin
from airflow.models import DagRun, DagModel, DAG
from datetime import datetime
from flask import Blueprint
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
        session = settings.Session()
        # this query should work for both postgres and mysql
        # Although it should be noted that for postgres you should be able to use a window function which is much cleaner
        result = session.execute(
            '''
                SELECT
                  dag_run.dag_id as dag_id
                  , dag_pickle.pickle as dag_pickle
                  , dag_run.execution_date as execution_date
                  , dag_run.start_date as start_date
                  , last_tasks.end_date as end_date
                  , dag_run.state as state
                FROM dag_run
                LEFT JOIN

                ( SELECT a.dag_id dag_id, a.execution_date, a.end_date as end_date, a.task_id as task_id
                FROM (
                    SELECT dag_id, execution_date, COALESCE(end_date, date(:today)) as end_date, task_id FROM task_instance
                ) as a
                LEFT JOIN
                
                  (
                    SELECT dag_id, execution_date, COALESCE(end_date, date(:today)) as end_date, task_id FROM task_instance
                  ) as b
                  ON a.dag_id=b.dag_id
                  AND a.execution_date = b.execution_date
                  AND a.end_date < b.end_date
                WHERE b.task_id IS NULL) as last_tasks
                
                  ON last_tasks.dag_id=dag_run.dag_id
                  AND last_tasks.execution_date=dag_run.execution_date
                
                LEFT JOIN dag
                  ON dag.dag_id = dag_run.dag_id
                
                LEFT JOIN dag_pickle
                  ON dag.pickle_id=dag_pickle.id

                WHERE dag_run.execution_date > :min_date
                GROUP BY dag_run.dag_id, dag_pickle.pickle, dag_run.execution_date, dag_run.start_date, last_tasks.end_date, dag_run.state
            ''',
            {'min_date': '2017-05-01', 'today': '2017-11-13'}
        )
        # print('RESULT FROM QUERY:')
        records = result.fetchall()
        # pprint.pprint(records)
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
