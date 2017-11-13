import json
from airflow import settings
from airflow.plugins_manager import AirflowPlugin
from airflow.models import DagRun, DagModel, DAG
from datetime import datetime
from flask import Blueprint
from flask_admin import BaseView, expose

def _get_end_date(dag_run):
    tasks = dag_run.get_task_instances()
    if len(tasks > 0):
        # print(tasks)
        end_dates = [x.end_date if x.end_date else datetime.now() for x in tasks]
        return sorted(end_dates)[-1].isoformat() + 'Z'
    return dag_run.start_date.isoformat('T') + 'Z'


class DagRunsView(BaseView):
    @expose('/')
    def test(self):
        session = settings.Session()
        DR = DagRun
        qry = session.query(DR)
        runs = qry.filter(
            DR.start_date > datetime(2017, 5, 1)
        ).all()
        dag_runs = [
             {
                'dagId': run.dag_id,
                'startDate': run.start_date.isoformat('T') + 'Z',
                'endDate': _get_end_date(run),
                'executionDate': run.execution_date.isoformat() + '.000Z',
                'executionDateStr': run.execution_date.strftime("%Y-%m-%d %H:%M:%S"),
                'schedule': 'unknown',  # TODO: how can we get the scheduled interval
                'state': run.get_state()
            } for run in runs]

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
