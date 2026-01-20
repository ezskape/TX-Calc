# True Texas Electricity Rate Calculator

A simple Flask application that helps customers understand their true electricity rate in the CenterPoint Energy service area. Enter your plan details and kWh usage to see the true rate per kWh and your approximate bill amount.

## Features

- Collects plan inputs including base charges and CenterPoint delivery rates
- Calculates the blended true rate per kWh rounded to the nearest one-hundredth of a cent
- Estimates the monthly bill amount based on the entered usage
- Provides a clean, responsive interface that works well on desktop and mobile

## Getting started

1. Create a virtual environment (optional but recommended):

   **macOS/Linux**

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

   **Windows (PowerShell)**

   ```powershell
   python -m venv .venv
   .venv\\Scripts\\Activate.ps1
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Run the application:

   **macOS/Linux**

   ```bash
   flask --app app run --debug
   ```

   **Windows (PowerShell)**

   ```powershell
   flask --app app run --debug
   ```

4. Open your browser to <http://127.0.0.1:5000> and begin calculating.

## Local Development (Windows vs Render)

Render runs on Linux, so the production start command uses Gunicorn: `gunicorn app:app`

On Windows, running Gunicorn may fail with `ModuleNotFoundError: No module named 'fcntl'`

For local development on Windows, run:

```bash
python app.py
```

## Environment variables

Set the following environment variables in Render (or your hosting provider):

- `BASE_URL`: The public site URL used to build absolute links in emails (for example, `https://www.wattwisetx.com`).

## Project structure

```
├── app.py              # Flask application with calculation API
├── templates/
│   └── index.html      # User interface
├── static/
│   ├── css/styles.css  # Styling for the calculator
│   └── js/main.js      # Front-end logic
└── requirements.txt    # Python dependencies
```

## TDU Routing Logic

The calculator uses the `pc` query parameter exclusively for postal codes and the `usage` field strictly for energy values. Keeping these values isolated prevents misrouting True Distribution Utility (TDU) selection and avoids calculation errors that can occur when postal codes and usage values are mixed.

## Testing the calculator manually

The API expects all numeric values. Usage must be greater than zero. As an example, entering the following values:

- Base charge: `4.95`
- Energy rate: `7.21`
- CenterPoint delivery rate: `5.90`
- CenterPoint base delivery charge: `4.90`
- kWh usage: `1000`

Produces:

- True Rate Per kWh: `14.10 ¢/kWh`
- Approximate Bill Amount: `$141.00`
