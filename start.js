#!/usr/bin/env node

const profile = require('./profile.json')

const fs = require('fs')
const path = require('path')
const exec = require('child_process').execSync
const { quote } = require('shell-quote')

function echo(str) {
  console.log(str)
}

if (false) {
  const settings = {
    'extensions.autoDisableScopes': 0,
    'extensions.enableScopes': 15,
    'extensions.startupScanScopes': 15,
    'extensions.lastAppBuildId': null,
    'extensions.lastAppVersion': null,
  }
  const replace = new RegExp(Object.keys(settings).map(setting => setting.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))
  for (const prefs of ['user', 'prefs']) {
    const user_prefs = []
    for (const user_pref of fs.readFileSync(path.join(profile.dir, `${prefs}.js`), 'utf-8').split('\n')) {
      if (!user_pref.match(replace)) user_prefs.push(user_pref)
    }
    for (const [user_pref, value] of Object.entries(settings)) {
      if (value !== null) user_prefs.push(`user_pref("${user_pref}", ${value});`)
    }

    fs.writeFileSync(path.join(profile.dir, `${prefs}.js`), user_prefs.join('\n'))
  }
}

exec('npm run build', {stdio: 'inherit'})

exec(quote(['rm', '-rf', path.join(profile.dir, 'extensions.json')]), {stdio: 'inherit'})
exec(quote(['rm', '-rf', path.join(profile.dir, 'extensions')]) + path.sep + 'zotero-prosec-linker*.xpi', {stdio: 'inherit'})

let code = path.resolve(path.join(__dirname, 'build'))
if (!code.endsWith(path.sep)) code += path.sep
fs.writeFileSync(path.join(profile.dir, 'extensions', 'prosec-linker@gmail.com'), code)

let zotero = null
switch (process.platform) {
  case 'darwin':
    zotero = '/Applications/Zotero.app/Contents/MacOS/zotero'
    break
}

exec(quote([zotero, '-purgecaches', '-P', profile.name, '-jsconsole', '-ZoteroDebugText']) + ' > ' + quote([profile.log]), {stdio: 'inherit'})
