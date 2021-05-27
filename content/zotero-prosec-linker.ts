declare const Zotero: any
// declare const Components: any

const monkey_patch_marker = 'ProsecLinkerMonkeyPatched'

// sorta-typings for Zotero
type Item = {
  id: number
  isNote: () => boolean
  isAnnotation?: () => boolean
  isAttachment?: () => boolean
  getField: (field) => string
  getAttachments: () => number[]
  attachmentLinkMode: number
  attachmentFilename: string
  attachmentContentType: string
}

type Template = {
  type: 'doi' | 'title' | 'pdf'
  name: string
  url: string
}

// monkey-patch helper
function patch(object, method, patcher) { // eslint-disable-line @typescript-eslint/no-unused-vars
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

    // patch menu builder to dynamically show/hide the menu item
    const self = this // eslint-disable-line @typescript-eslint/no-this-alias
    patch(Zotero.getActiveZoteroPane(), 'buildItemContextMenu', original => async function ZoteroPane_buildItemContextMenu() {
      await original.apply(this, arguments) // eslint-disable-line prefer-rest-params
      try {
        const menuitem = self.globals.document.getElementById('prosec-link')
        const candidates = self.candidates()
        menuitem.hidden = candidates.length === 0
      }
      catch (err) {
        self.debug({ error: err.message })
      }
    })
  }

  public openPreferenceWindow() {
    this.globals.window.openDialog(
      'chrome://zotero-prosec-linker/content/preferences.xul',
      'prosec-linker-preferences',
      `chrome,titlebar,toolbar,centerscreen${Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal'}`
    )
  }

  // get the active templates
  private templates(): Template[] {
    const templates: Template[] = []
    for (const type of ['doi', 'title', 'pdf']) {
      if (!Zotero.Prefs.get(`prosec-linker.${type}`)) continue

      for (const n of [1, 2]) {
        const url: string = Zotero.Prefs.get(`prosec-linker.${type}.url.${n}`)
        const name: string = Zotero.Prefs.get(`prosec-linker.${type}.name.${n}`)
        if (name && url) {
          templates.push({ type: (type as 'doi' | 'title' | 'pdf'), name, url })
        }
      }
    }
    return templates
  }

  private debug(o) {
    Zotero.debug(`zotero-prosec-linker:: ${JSON.stringify(o, null, 2)}`)
  }


  // fetch DOI from field if available, fall back to extra field
  private itemDOI(item: Item): string {
    const doi = item.getField('DOI')
    if (doi) return doi

    for (const line of (item.getField('extra') || '').split('\n')) {
      const m = line.trim().match(/^DOI:\s*(.+)/i)
      if (m) return m[1]
    }

    return ''
  }

  // of the currently selected items, return those that have space for one or more uninstantiated templates
  private candidates(): { item: Item, links: Template[] }[] {
    const templates = this.templates()
    // if no templates are configured, we're done
    if (templates.length === 0) return []

    this.debug({ templates })

    // get selected items
    const items = (Zotero.getActiveZoteroPane().getSelectedItems() as Item[])
      // ignore notes, annotations and attachments
      .filter((item: Item) => !(item.isNote() || item.isAttachment() || item.isAnnotation?.()))
      // add uninstantiated templates
      .map((item: Item) => {
        const attachments: Item[] = Zotero.Items.get(item.getAttachments())

        const fields = {
          title: item.getField('title'),
          doi: this.itemDOI(item),
          pdf: attachments.find((att: Item): boolean => att.attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE && att.attachmentContentType === 'application/pdf')?.attachmentFilename.replace(/\.pdf$/i, ''),
        }

        // get existing link-attachments
        const link_attachments: string[] = attachments.filter((att: Item) => att.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL).map((att: Item) => att.getField('url'))
        this.debug({
          link_attachments,
          fields,
          attachments: attachments.map((att: Item) => ({
            linkMode: att.attachmentLinkMode,
            contentType: att.attachmentContentType,
            filename: att.attachmentFilename,
          })),
        })

        return {
          item,
          links: templates
            // try to fill out the templates
            .map((link: Template): Template => {
              let url = fields[link.type] ? link.url.replace(`{${link.type.toUpperCase()}}`, encodeURIComponent(fields[link.type])) : ''
              // remove filled out templates that are already instantiated on the item
              if (url && link_attachments.includes(url)) url = ''
              this.debug({ link: { ...link, url } })
              return { ...link, url }
            })
            // select the filled out templates
            .filter((link: Template) => link.url),
        }
      })
      // select those items that still have links to add
      .filter(({ item, links }: { item: Item, links: Template[] }) => links.length > 0) // eslint-disable-line @typescript-eslint/no-unused-vars

    return items
  }

  // create the link attachments
  public async link() {
    try {
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
    catch (err) {
      this.debug({ error: err.message })
    }
  }
}

Zotero.ProsecLinker = new ProsecLinker
