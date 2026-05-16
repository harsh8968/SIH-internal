import subprocess
import os
import sys
import time
import signal

def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(project_root, "backend")
    frontend_dir = os.path.join(project_root, "crackx-app")

    print("==================================================")
    print("   🚀 CrackX App - Single Terminal Launcher")
    print("==================================================")

    processes = []

    try:
        print("\n1. Starting Backend Server...")
        backend_proc = subprocess.Popen(
            [sys.executable, "main.py"],
            cwd=backend_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace',
            bufsize=1
        )
        processes.append(backend_proc)

        print("2. Starting Metro Bundler (Web/PWA)...")
        metro_proc = subprocess.Popen(
            ["npx", "expo", "start", "--web"],
            cwd=frontend_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace',
            bufsize=1,
            shell=True
        )
        processes.append(metro_proc)

        print("\n[INFO] Backend and Web services initiated.")
        print("[INFO] Press Ctrl+C to stop everything.\n")

        # Function to print output from background processes
        import threading
        def print_output(name, pipe):
            for line in iter(pipe.readline, ''):
                print(f"[{name}] {line.strip()}")

        threading.Thread(target=print_output, args=("Backend", backend_proc.stdout), daemon=True).start()
        threading.Thread(target=print_output, args=("Metro", metro_proc.stdout), daemon=True).start()

        # Keep the script running
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n\nStopping all services...")
        for p in processes:
            if os.name == 'nt':
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(p.pid)])
            else:
                p.terminate()
        print("Done.")

if __name__ == "__main__":
    main()
