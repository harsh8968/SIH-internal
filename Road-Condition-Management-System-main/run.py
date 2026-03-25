import subprocess
import os
import sys
import time

def run_command_new_window(command, cwd, title):
    """Runs a command in a new terminal window (Windows)."""
    if os.name == 'nt':
        # cmd /k keeps the window open after the command finishes/fails so you can see logs
        # The first argument to start is the Window Title in quotes
        subprocess.Popen(f'start "{title}" cmd /k "{command}"', cwd=cwd, shell=True)
    else:
        print(f"Starting {title} in background (Non-Windows)...")
        subprocess.Popen(command, cwd=cwd, shell=True)

def main():
    # Get the directory where this script is located
    project_root = os.path.dirname(os.path.abspath(__file__))
    
    backend_dir = os.path.join(project_root, "backend")
    frontend_dir = os.path.join(project_root, "crackx-app")

    print("==================================================")
    print("   🚀 CrackX App - Full Stack Launcher")
    print("==================================================")

    # Check directories
    if not os.path.exists(backend_dir):
        print(f"❌ Error: Backend directory not found at {backend_dir}")
        return
    if not os.path.exists(frontend_dir):
        print(f"❌ Error: Frontend directory not found at {frontend_dir}")
        return

    print("\n1. Launching Backend Server (Python/FastAPI)...")
    # Launching python main.py
    run_command_new_window("python main.py", backend_dir, "CrackX Backend Server")
    
    # Wait a moment for backend to potentially start (optional, just for UX)
    time.sleep(2)

    print("2. Launching Frontend Web App (Expo)...")
    # Launching npm run web
    # This will compile the web app and typically open the default browser
    run_command_new_window("npm run web", frontend_dir, "CrackX Frontend Web")

    print("\n✅ All services launched!")
    print("--------------------------------------------------")
    print("• Backend Terminal: Running on http://localhost:5000")
    print("• Frontend Terminal: Building web bundle...")
    print("• The browser should open automatically once the build completes.")
    print("--------------------------------------------------")
    print("Note: Keep the terminal windows open to keep the servers running.")
    print("You can close this launcher window now.")

if __name__ == "__main__":
    main()
