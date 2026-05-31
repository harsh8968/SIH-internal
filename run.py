import subprocess
import os
import sys
import time
import socket

# Reconfigure stdout/stderr to support Unicode characters (like emojis) on Windows terminal environments
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def is_port_in_use(port):
    """Check if a local TCP port is already in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def kill_process_on_port(port):
    """Locate and kill the process occupying a specific TCP port."""
    if not is_port_in_use(port):
        return True
    print(f"⚠️  Port {port} is occupied. Attempting to free it...")
    try:
        if os.name == 'nt':
            # Windows: Find PID using netstat and terminate it
            output = subprocess.check_output(f'netstat -ano | findstr LISTENING | findstr :{port}', shell=True, text=True)
            pids = set()
            for line in output.strip().split('\n'):
                parts = line.split()
                if len(parts) >= 5:
                    pid = parts[-1]
                    if pid.isdigit() and int(pid) > 0:
                        pids.add(pid)
            
            for pid in pids:
                print(f"🛑 Terminating process with PID {pid} blocking port {port}...")
                subprocess.call(f'taskkill /F /T /PID {pid}', shell=True)
        else:
            # macOS/Linux: Find PID using lsof and terminate it
            output = subprocess.check_output(f'lsof -t -i:{port}', shell=True, text=True)
            for pid in output.strip().split('\n'):
                if pid:
                    print(f"🛑 Terminating process with PID {pid} blocking port {port}...")
                    subprocess.call(f'kill -9 {pid}', shell=True)
        time.sleep(1.5)
        return not is_port_in_use(port)
    except Exception as e:
        print(f"❌ Failed to clear port {port}: {e}")
        return False

def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(project_root, "backend")
    frontend_dir = os.path.join(project_root, "crackx-app")

    # 1. Check & Clean port 5000 (Backend) and port 8081 (Metro Web)
    print("\n🔍 Checking port status...")
    kill_process_on_port(5000)
    kill_process_on_port(8081)

    # 2. Automatically check and install node modules if missing
    node_modules_dir = os.path.join(frontend_dir, "node_modules")
    if not os.path.exists(node_modules_dir):
        print("\n📦 node_modules not found inside 'crackx-app'.")
        print("⚡ Running 'npm install' to set up dependencies automatically...")
        try:
            subprocess.run("npm install", cwd=frontend_dir, shell=True, check=True)
            print("✅ Dependencies successfully installed!")
        except Exception as e:
            print(f"❌ Failed to automatically install dependencies: {e}")
            print("⚠️  Please run 'npm install' manually inside the 'crackx-app' directory.")
            sys.exit(1)

    processes = []

    try:
        print("\n1️⃣ Starting FastAPI Backend Server...")
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

        # Wait a brief moment to let backend bind its port
        time.sleep(1)

        print("2️⃣ Starting Metro Bundler (Web/PWA Mode)...")
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

        print("\n==================================================")
        print("🎉 Services initiated successfully!")
        print("📡 Backend API: http://localhost:5000")
        print("🖥️ Web App:     http://localhost:8081")
        print("👉 Press [Ctrl+C] to stop all services gracefully")
        print("==================================================\n")

        # Function to print output from background processes asynchronously
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
        print("\n\n🛑 Stopping all services gracefully...")
        for p in processes:
            try:
                if os.name == 'nt':
                    subprocess.call(['taskkill', '/F', '/T', '/PID', str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    p.terminate()
            except Exception:
                pass
        
        # Double clean check
        time.sleep(0.5)
        kill_process_on_port(5000)
        kill_process_on_port(8081)
        print("✨ Services stopped. Cleanup complete!")

if __name__ == "__main__":
    main()
