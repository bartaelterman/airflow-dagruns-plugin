import json

from airflow import settings
from airflow.plugins_manager import AirflowPlugin
from airflow.models import DagRun, DagModel, DAG
from datetime import datetime
from flask import Blueprint
from flask_admin import BaseView, expose
from flask_admin.base import MenuLink


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
                'startDate': run.start_date.isoformat('T'),
                'endDate': run.end_date.isoformat() if run.end_date else datetime.now().isoformat(),
                'executionDate': run.execution_date.isoformat(),
                'schedule': 'unknown',  # TODO: how can we get the scheduled interval
                'state': run.get_state()
            } for run in runs]

        return self.render("dag_runs.html", dag_runs=json.dumps(dag_runs))


v = DagRunsView(category="DAG runs plugin", name="DAG runs")


# Creating a flask blueprint to intergrate the templates and static folder
bp = Blueprint(
    "dagruns_plugin", __name__,
    template_folder='templates', # registers airflow/plugins/templates as a Jinja template folder
    static_folder='static',
    static_url_path='/static/dagruns')


ml = MenuLink(
    category='DAG runs',
    name='DAG runs',
    url='http://vente-exclusive.com/')


# Defining the plugin class
class DagRunsPlugin(AirflowPlugin):
    name = "dagruns_plugin"
    admin_views = [v]
    flask_blueprints = [bp]
    # menu_links = [ml]