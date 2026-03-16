module.exports = [
  {
    "type": "heading",
    "defaultValue": "Plane Map Configuration"
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Display Settings"
      },
      {
        "type": "toggle",
        "messageKey": "UNITS_METRIC",
        "defaultValue": false,
        "label": "Use Metric Units",
        "description": "Switch from nautical miles, feet, and knots to kilometers, meters, and km/h."
      },
      {
        "type": "toggle",
        "messageKey": "ROTATE_MAP",
        "defaultValue": false,
        "label": "Rotate Map",
        "description": "Rotate the map according to the compass direction."
      },
      {
        "type": "slider",
        "messageKey": "MAX_PLANES",
        "defaultValue": 20,
        "label": "Max Planes",
        "description": "Maximum number of planes to track and display (1-50).",
        "min": 1,
        "max": 50,
        "step": 1
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Location Override"
      },
      {
        "type": "toggle",
        "messageKey": "OVERRIDE_LOCATION",
        "defaultValue": false,
        "label": "Manual Location",
        "description": "Use manual coordinates instead of GPS."
      },
      {
        "type": "input",
        "messageKey": "MANUAL_LAT",
        "defaultValue": "",
        "label": "Latitude",
        "attributes": {
          "type": "number",
          "step": "any"
        }
      },
      {
        "type": "input",
        "messageKey": "MANUAL_LON",
        "defaultValue": "",
        "label": "Longitude",
        "attributes": {
          "type": "number",
          "step": "any"
        }
      }
    ]
  },
  {
    "type": "submit",
    "defaultValue": "Save Settings"
  }
];
