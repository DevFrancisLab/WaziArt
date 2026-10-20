"""The sample workflow runs as a command on this machine."""

import helpers  # noqa: F401

import os
import subprocess
import sys
import unittest
from tempfile import TemporaryDirectory


class DemoTests(unittest.TestCase):
    def test_demo_command_prints_the_revision(self):
        with TemporaryDirectory() as directory:
            env = os.environ.copy()
            env["PYTHONPATH"] = str(helpers.SRC)
            completed = subprocess.run(
                [sys.executable, "-m", "waziart.demo", "--data", f"{directory}/space.metta"],
                cwd=helpers.ROOT,
                env=env,
                check=False,
                text=True,
                capture_output=True,
            )
        self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
        self.assertIn("request_information", completed.stdout)
        self.assertIn("human_review", completed.stdout)
        self.assertIn("recommend_for_review", completed.stdout)
        self.assertIn("request_information → recommend_for_review", completed.stdout)


if __name__ == "__main__":
    unittest.main()
