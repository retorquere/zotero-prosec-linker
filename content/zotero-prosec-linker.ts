declare const Zotero: any
// declare const Components: any

const monkey_patch_marker = 'ProsecLinkerMonkeyPatched'

type Item = {
  id: number
  isNote: () => boolean
  isAnnotation?: () => boolean
  isAttachment?: () => boolean
  getField: (field) => string
  getAttachments: () => number[]
  attachmentLinkMode: number
}

type Link = {
  type: 'doi' | 'title'
  name: string
  url: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function patch(object, method, patcher) {
  if (object[method][monkey_patch_marker]) return
  object[method] = patcher(object[method])
  object[method][monkey_patch_marker] = true
}

class ProsecLinker { // tslint:disable-line:variable-name
  private initialized = false
  private globals: Record<string, any>
  private strings: any
  private attachmentTypeID: number

  // eslint-disable-next-line @typescript-eslint/require-await
  public async load(globals: Record<string, any>) {
    this.globals = globals

    if (this.initialized) return
    this.initialized = true

    await Zotero.Schema.schemaUpdatePromise

    this.attachmentTypeID = Zotero.ItemTypes.getID('attachment')
    this.strings = globals.document.getElementById('zotero-prosec-linker-strings')

    const self = this // eslint-disable-line @typescript-eslint/no-this-alias
    patch(Zotero.getActiveZoteroPane(), 'buildItemContextMenu', original => async function ZoteroPane_buildItemContextMenu() {
      await original.apply(this, arguments) // eslint-disable-line prefer-rest-params
      const menuitem = self.globals.document.getElementById('prosec-link')
      menuitem.hidden = self.candidates().length === 0
    })
  }

  public openPreferenceWindow() {
    this.globals.window.openDialog(
      'chrome://zotero-prosec-linker/content/preferences.xul',
      'prosec-linker-preferences',
      `chrome,titlebar,toolbar,centerscreen${Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal'}`
    )
  }

  private links(): Link[] {
    const links: Link[] = []
    for (const type of ['doi', 'title']) {
      if (!Zotero.Prefs.get(`prosec-linker.${type}`)) continue

      for (const n of [1, 2]) {
        const url: string = Zotero.Prefs.get(`prosec-linker.${type}.url.${n}`)
        const name: string = Zotero.Prefs.get(`prosec-linker.${type}.name.${n}`)
        if (name && url) {
          links.push({ type: (type as 'doi' | 'title'), name, url })
        }
      }
    }
    return links
  }

  private itemDOI(item: Item): string {
    const doi = item.getField('doi')
    if (doi) return doi

    for (const line of (item.getField('extra') || '').split('\n')) {
      const m = line.trim().match(/^DOI:\s*(.+)/i)
      if (m) return m[1]
    }

    return ''
  }

  private candidates(): { item: Item, links: Link[] }[] {
    const templates = this.links()
    if (templates.length === 0) return []

    const items = (Zotero.getActiveZoteroPane().getSelectedItems() as Item[])
      .filter((item: Item) => !(item.isNote() || item.isAttachment() || item.isAnnotation?.()))
      .map((item: Item) => {
        const fields = {
          title: item.getField('title'),
          doi: this.itemDOI(item),
        }

        const link_attachments: string[] = Zotero.Items.get(item.getAttachments()).filter((att: Item) => att.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL).map((att: Item) => att.getField('url'))

        return {
          item,
          links: templates
            .map((link: Link): Link => {
              let url = fields[link.type] ? link.url.replace(`{${link.type.toUpperCase()}}`, encodeURIComponent(fields[link.type])) : ''
              if (url && link_attachments.includes(url)) url = ''
              return { ...link, url }
            })
            .filter((link: Link) => link.url),
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .filter(({ item, links }: { item: Item, links: Link[] }) => links.length > 0)

    return items
  }

  public async link() {
    for (const { item, links } of this.candidates()) {
      for (const link of links) {
        const att = new Zotero.Item(this.attachmentTypeID)
        att.parentItemID = item.id
        att.setField('title', link.name)
        att.setField('url', link.url)
        att.attachmentLinkMode = Zotero.Attachments.LINK_MODE_LINKED_URL
        await att.saveTx()
      }
    }
  }
}

Zotero.ProsecLinker = new ProsecLinker
Zotero.debug(`linker: live: ${typeof Zotero.debug}`)
