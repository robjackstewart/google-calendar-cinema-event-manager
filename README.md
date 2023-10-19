# Google Calendar Cinema

## How to use
1. Install dependencies:
    ``` shell
    npm install
    ```

1. Sign in to google app scripts
    ``` shell
    npm run login
    ```

1. Push your code to google app scripts
    ``` shell
    npm run push
    ```

1. Open google app scripts in your browser
    ``` shell
    npm run open
    ```

1. Add a `The Movie Database` access token as a property to your script:
    1. Click `Project settings` in the left-hand pane
    1. Click `Edit script properties`
    1. Add the following in the `Script Properties` sections
        - Property: `TMDB_ACCESS_TOKEN`
        - Value: `<your-tmdb-access-token>`
    1. Click `Save script properties`

1. Run the code:
    
    Via UI:
      1. Select `main` from the function dropdown
      1. Click `Run`
    
    Via Trigger:
      1. Select `Triggers` in the left-hand pane
      1. Click `Add Trigger`
      1. Populate the fields based on your requirements
      1. Click `Save`