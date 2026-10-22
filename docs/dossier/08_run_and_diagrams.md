# 08 Run guide and diagrams

Python version and hardware minimums, camera minimum resolution/FPS are NOT SPECIFIED. ONNX CPU provider configured. Run commands:
~~~powershell
python -m venv .venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run_live.py --camera --no-firestore
python run_live.py --url "http://PHONE_IP:8080/video" --no-firestore
python run_live.py --video "data/manual_test_videos/fall-another.mp4" --no-firestore
python run_live.py --list-elders
streamlit run dashboard/app.py
cd mobile_app
npm install
npx expo start
npx expo run:android
~~~
Cloud needs Firebase Admin credentials and recipient tokens; redact credentials. Package and bundle id com.insight.fallsafety; Expo ~51, RN .74.5, Android min 23/target 34. APK size/build NOT MEASURED this session. Mermaid diagrams in 06_app_screens.md.
## Configuration references
- requirements.txt Python lower bounds.
- mobile_app/package.json and package-lock.json dependencies/scripts.
- mobile_app/android/build.gradle and mobile_app/android/gradle/wrapper/gradle-wrapper.properties Android SDK/Gradle.
- mobile_app/app.json identifiers and permissions.
- functions/package.json Node runtime.
- firebase.json Firebase deployment targets.
