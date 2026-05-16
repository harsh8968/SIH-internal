# 🛣️ RCMS - Road Condition Management System (CrackX)

RCMS is a comprehensive, AI-powered platform designed to streamline the reporting, tracking, and repair of road defects (potholes, cracks, etc.). It connects Citizens, Road Safety Officers (RSOs), Contractors, Compliance Officers, and Administrators in a unified ecosystem to ensure safer roads.

---

## 🌟 Key Features

### 📱 For Citizens
-   **AI-Powered Reporting**: Automatically detects pothole severity from photos/videos using a custom YOLOv8 model.
-   **Geo-Tagging**: precise location tracking for every report.
-   **Real-time Updates**: Track the status of your report from "Pending" to "Completed".
-   **Points & Rewards**: Earn points for valid reports (Gamification).

### 👮 For Road Safety Officers (RSOs)
-   **Zone Management**: View reports specific to assigned zones.
-   **Verification Workflow**: Verify reports, assign contractors, and approve completed work.
-   **Contractor Oversight**: Monitor contractor performance and timelines.

### 👷 For Contractors
-   **Work Orders**: Receive assigned tasks with location and severity details.
-   **Proof of Work**: Upload "After" photos/videos to mark repairs as complete.

### 🏛️ For Administrators & Compliance
-   **Disaster Heatmap**: Visual analytics of road damage density across the city.
-   **User Management**: Manage roles (RSO, Contractor, Citizen).
-   **Performance Metrics**: Track repair times, contractor efficiency, and road health indices.
-   **Automated Reports**: Generate PDF compliance reports.

---

## 🛠️ Tech Stack

### **Frontend (Mobile & Web)**
-   **Framework**: [React Native](https://reactnative.dev/) with [Expo](https://expo.dev/)
-   **Language**: TypeScript
-   **Navigation**: React Navigation (Stack)
-   **Styling**: StyleSheet API with custom constants

### **Backend (AI & API)**
-   **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python)
-   **AI Model**: YOLOv8 (Ultralytics) for object detection.
-   **Image Processing**: PIL, NumPy, OpenCV.

### **Database & Storage**
-   **Platform**: [Supabase](https://supabase.com/) (PostgreSQL)
-   **Storage**: Supabase Storage Buckets (for photos/videos)
-   **Auth**: Supabase Auth

---

## 🚀 Getting Started

### Prerequisites
-   **Node.js** (v18+)
-   **Python** (v3.9+)
-   **Expo CLI**: `npm install -g expo-cli`
-   **Supabase Account**: For database and authentication.

### 1. Installation

**Clone the repository:**
```bash
git clone <repository_url>
cd RCMS
```

**Backend Setup:**
```bash
cd backend
# Create a virtual environment (optional but recommended)
python -m venv venv
# Activate it:
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

**Frontend Setup:**
```bash
cd crackx-app
npm install
```

### 2. Configuration (.env)

**Backend:**
Create a `.env` file in the `backend/` directory:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
```

**Frontend:**
Create a `.env` file in the `crackx-app/` directory:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Database Setup
Run the setup scripts to initialize your Supabase project:
```bash
cd scripts
node setup-supabase.js
```
*Alternatively, use the SQL files in the `database/` folder to manually set up tables and storage policies in the Supabase SQL Editor.*

## ▶️ Running the Application

The application has been migrated to a **Bare React Native** project.

```bash
# 1. Start the Metro Bundler
cd crackx-app
npm start

# 2. Run on Android (In a new terminal)
cd crackx-app
npm run android

# 3. Launch Backend
cd backend
python main.py
```

---

## 📂 Project Structure

```
RCMS/
├── backend/                # Python FastAPI Server & AI Model
│   ├── model/              # YOLO model weights (.pt)
│   ├── main.py             # API Entry point
│   └── ...
├── crackx-app/             # React Native / Expo Frontend
│   ├── src/
│   │   ├── screens/        # UI Screens (Citizen, RSO, Admin)
│   │   ├── components/     # Reusable UI components
│   │   ├── services/       # API & Supabase services
│   │   └── ...
├── database/               # SQL Schemas & Migration scripts
├── scripts/                # Utility scripts (Setup, Migration)
└── run.py                  # All-in-one Launcher Script
```

## 🤝 Contributing
1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request
