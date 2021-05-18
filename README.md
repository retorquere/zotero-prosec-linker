Prosec Linker
=================

Install by downloading the [latest version](https://github.com/retorquere/zotero-prosec-linker/releases/latest)

PROSEC linker for Zotero

## Development

This plugin was written using typescript. Typescript is javascript,
with optional types -- if you know javascript, you know typescript.
The type systems prevents a lot of mistakes at build time which
would otherwise -- maybe -- show up at runtime, on a system you
don't have access to.

The code is developed in the `content` directory, the main entrypoint
is `zotero-prosec-linker.ts`. If you want to break up the code, you
can use the reqular `require` and `import` calls; the compilation
phase will take care of combining those to a working whole.

You have the following `npm` commands available to you:

* `run lint`: will check the code for inconsistencies and potential mistakes the compiler wouldn't catch.
* `run build`: compile the code and build a package in the `xpi` directory.
* `start`: start Zotero with the plugin installed. More on this below.
* `version <major|minor|patch>`: release a new formal version.

## Starting Zotero

In order to automatically start Zotero to test the plugin, a one-time setup is required. We're going to create a separate testing profile so it does not pollute your regular Zotero install.

* Start Zotero with the `-P` parameter. Let's say you call this profile `dev`. During creation, make a note of the profile folder (under "Your user settings, preferences and other user-related data will be stored in:").
* Let Zotero start in that profile, go to `Preferences` -> `Advanced` -> `Files and Folders`, click `Data Directory Location` -> `Custom` and select an *empty* folder. Make a note of this folder. **THIS *Must* be something different that the Folder `Zotero` in your home directory**.

In your copy of this plugin source, create a file named `profile.json` containing

```
{
  "name": "<the profile name you chose in step 1>",
  "dir": "<the profile folder you chose/received in step 1>",
  "log": "<the profile folder you chose/received in step 1>/log.txt"
}
```

Make sure Zotero is not already running. You can now start Zotero with the current version of the plugin pre-installed by running `npm start`. The first time you start Zotero this way, you will need to go into the addons list of Zotero and enable it. At next start, it will already be enabled.

This is now a separate library from your main library. It will be empty initially, but you can import using the browser plugin as usual when it runs.

## Releasing a new version

You can release a new version by running `npm version <major|minor|patch>`. This will generate a new version number and send it to github. A GitHub Action will release a new version for you. Existing installs will automatically update when Zotero looks for new plugin versions; this check usually happens every two days.

## Releasing a debug build

Sometimes you want to release a version for a specific user when doing problem analysis. If the user has opened an GitHub issue, let's say issue number 15, create a branch `gh-15`, make change (for extra loggin for example, or to test a potential fix), and push the changes to github. A GitHub bot will automatically create a plugin build from the sources in that branch, and place a message in the conversation in issue 15 on how to download it.
