from app.core.celery_app import celery_app

@celery_app.task
def example_task():
    print("Hello from Celery")