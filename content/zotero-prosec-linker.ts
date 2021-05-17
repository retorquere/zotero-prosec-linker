declare const Zotero: any
// declare const Components: any

const monkey_patch_marker = 'ProsecLinkerMonkeyPatched'

type Item = {
  isNote: () => boolean
  isAnnotation?: () => boolean
  isAttachment?: () => boolean
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function patch(object, method, patcher) {
  if (object[method][monkey_patch_marker]) return
  object[method] = patcher(object[method])
  object[method][monkey_patch_marker] = true
}

function selected(): Item[] {
  return (Zotero.getActiveZoteroPane().getSelectedItems() as Item[]).filter((item: Item) => !(item.isNote() || item.isAttachment() || item.isAnnotation?.()))
}

class ProsecLinker { // tslint:disable-line:variable-name
  private initialized = false
  private globals: Record<string, any>
  private strings: any

  // eslint-disable-next-line @typescript-eslint/require-await
  public async load(globals: Record<string, any>) {
    this.globals = globals

    if (this.initialized) return
    this.initialized = true

    this.strings = globals.document.getElementById('zotero-prosec-linker-strings')

    const self = this // eslint-disable-line @typescript-eslint/no-this-alias
    patch(Zotero.getActiveZoteroPane(), 'buildItemContextMenu', original => async function ZoteroPane_buildItemContextMenu() {
      await original.apply(this, arguments) // eslint-disable-line prefer-rest-params
      const menuitem = self.globals.document.getElementById('prosec-link')
      menuitem.hidden = selected().length === 0
    })
  }

  openPreferenceWindow() {
    this.globals.window.openDialog(
      'chrome://zotero-prosec-linker/content/preferences.xul',
      'prosec-linker-preferences',
      `chrome,titlebar,toolbar,centerscreen${Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal'}`
    )
  }

  link() {
    const items = selected()
    alert(`${items.length}`)
  }
}

Zotero.ProsecLinker = new ProsecLinker
Zotero.debug(`linker: live: ${typeof Zotero.debug}`)
