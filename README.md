# True Texas Electricity Rate Calculator

A simple Flask application that helps customers understand their true electricity rate in the CenterPoint Energy service area. Enter your plan details and kWh usage to see the true rate per kWh and your approximate bill amount.

## Features

- Collects plan inputs including base charges and CenterPoint delivery rates
- Calculates the blended true rate per kWh rounded to the nearest one-hundredth of a cent
- Estimates the monthly bill amount based on the entered usage
- Provides a clean, responsive interface that works well on desktop and mobile

## Getting started

1. Create a virtual environment (optional but recommended):

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Run the application:

   ```bash
   flask --app app run --debug
   ```

4. Open your browser to <http://127.0.0.1:5000> and begin calculating.

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

