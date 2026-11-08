Google Apps Script files.

PASTE THESE (once):
MainSpreadsheet/Loader.gs  - into "Code" in the family's dashboard Sheet (Extensions > Apps Script).
Licence/Loader.gs          - into "Code" in the seller's licence server Sheet.
  Also replace Admin (Admin.html - a spare copy used if GitHub can't be reached) and appsscript.json.
  Then Deploy > Manage deployments > pencil > Version: New version > Deploy (the web address stays the same).

The loader fetches the program from these apps each time the script runs (MainSpreadsheet: setup/files/Code.gs;
Licence: Licence/Code.gs), keeps a copy for a few hours, and a backup in a hidden tab of the Sheet. So updates
arrive by themselves within 5 minutes - no Apps Script API, no Google Cloud project, no saved versions used.

Code.gs in each folder is the full program (what the loader runs). Pasting it instead of the loader also works,
but then updates need the Apps Script API (see Help > Updates).
