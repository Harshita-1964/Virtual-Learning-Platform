# 📚 Virtual Learning Environment (VLE) – Real-Time Engagement Tracking

A cutting-edge educational technology platform that enhances online learning by tracking student engagement in real-time using advanced computer vision techniques.

## 🚀 Features

- 🔐 **Secure Authentication System**  
  Users can log in to access a personalized dashboard displaying available and enrolled subjects.

- 📚 **Course Management**  
  Subjects include AI, DBMS, OS, and CN, with visual indicators for enrollment status.

- 🧑‍🏫 **Virtual Classrooms**  
  Students join video-enabled classrooms with integrated webcam monitoring.

- 🧠 **Real-Time Engagement Tracking**  
  Utilizes MediaPipe's neural networks to track:
  - 468 facial landmarks
  - 33 body pose points
  - Eye movements
  - Blinks
  - Posture
  - Facial expressions

- 📈 **Attentiveness Scoring System**  
  Generates scores (0–100) based on:
  - Expressions (70%)
  - Eye movement (15%)
  - Blink rate (10%)
  - Posture (5%)

- 📊 **Analytics Dashboard**  
  Visual representation of attentiveness data with PDF report export.

- 🌐 **LMS Integration**  
  Ready for integration with platforms like Moodle.

---

## 🛠️ Tech Stack

| Layer         | Technology       |
|---------------|------------------|
| Frontend      | React.js         |
| Backend       | Express.js       |
| CV Microservice | Flask + MediaPipe |
| Styling       | CSS              |
| API Comm.     | RESTful APIs     |
| Auth          | JWT/Auth Tokens  |

---

## 🧪 MediaPipe Tracking Details

- **Eye Movement:** Weighted pupil center (60% on center landmarks), threshold: `0.007`
- **Blink Detection:** State machine, thresholds: `0.17` (open), `0.10` (closed)
- **Posture Detection:** Spine angle, shoulder tilt, head position (5-state classification)
- **Facial Expression Detection:** Focused, distracted, confused, neutral

---

## 📷 Screenshots

![image](https://github.com/user-attachments/assets/38467bbb-839d-432e-b1e6-ff121a1093ea)
![image](https://github.com/user-attachments/assets/95d2c270-c052-4289-a9bb-910aac24e150)
![image](https://github.com/user-attachments/assets/e8190bdf-77b8-4499-9e8e-4703c15bd862)
![image](https://github.com/user-attachments/assets/ea09aa2c-0a92-4079-bf20-3efbb47d7823)


---

## 📦 Installation

### 🔧 Prerequisites
- Node.js
- Python 3.x
- MediaPipe
- Flask
- MongoDB / Firebase (for user data)
- Git

### ⚙️ Setup Instructions

```bash
### ⚙️ Setup Instructions

```bash
# Clone the repository
git clone https://github.com/Harshita-1964/Virtual-Learning-Platform.git
cd Virtual-Learning-Platform

# Frontend
cd client
npm install
npm start

# Backend
cd ../server
npm install
node index.js

# Flask Microservice
cd ../cv-service
pip install -r requirements.txt
python app.py
