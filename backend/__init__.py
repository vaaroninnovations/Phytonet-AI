"""PhytoNet AI backend package.

An explicit ``__init__.py`` is provided so that ``celery -A backend.celery_app``
resolves the ``backend`` module reliably across Python interpreters and
working-directory configurations (avoids relying on PEP 420 implicit namespace
package discovery inside the Celery worker container).
"""
