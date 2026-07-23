#!/usr/bin/env python3
import os
import sys
import signal
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from simulation.engine import engine
from simulation.logger import log


def signal_handler(signum, frame):
    log.info("Received signal to stop", component="ENGINE")
    engine.stop()
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def main():
    print()
    print("=" * 60)
    print("  ENTERPRISE AWS SIMULATION ENGINE")
    print("  LocalStack Enterprise Simulation")
    print("=" * 60)
    print()

    engine.start()

    try:
        while engine._running:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        engine.stop()


if __name__ == "__main__":
    main()
