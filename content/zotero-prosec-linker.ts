declare const Zotero: any
// declare const Components: any

const monkey_patch_marker = 'ProsecLinkerMonkeyPatched'

// sorta-typings for Zotero
type Item = {
  id: number
  isRegularItem: () => boolean
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
  action: 'add' | 'delete'
  type: 'doi' | 'title' | 'pdf'
  name: string
  url: string
}

type Action = {
  action: 'add'
  name: string
  url: string
} | {
  action: 'delete'
  attachment: Item
}

// monkey-patch helper
function patch(object, method, patcher) {
  if (object[method][monkey_patch_marker]) return
  object[method] = patcher(object[method])
  object[method][monkey_patch_marker] = true
}

function isURL(att: Item): boolean {
  return att.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL
}

function isPDF(att: Item): boolean {
  switch (att.attachmentLinkMode) {
    case Zotero.Attachments.LINK_MODE_IMPORTED_FILE:
    case Zotero.Attachments.LINK_MODE_IMPORTED_URL:
    case Zotero.Attachments.LINK_MODE_LINKED_FILE:
      return att.attachmentContentType === 'application/pdf'
    default:
      return false
  }
}

class ProsecLinker { // tslint:disable-line:variable-name
  private initialized = false
  private globals: Record<string, any>
  private strings: any
  private attachmentTypeID: number

  // eslint-disable-next-line @typescript-eslint/require-await
  public async load(globals: Record<string, any>) {
    this.debug('loading')
    this.globals = globals

    if (this.initialized) return
    this.initialized = true

    await Zotero.Schema.schemaUpdatePromise

    this.attachmentTypeID = Zotero.ItemTypes.getID('attachment')
    this.strings = globals.document.getElementById('zotero-prosec-linker-strings')

    this.debug('patching')
    // patch menu builder to dynamically show/hide the menu item
    const self = this // eslint-disable-line @typescript-eslint/no-this-alias
    patch(Zotero.getActiveZoteroPane(), 'buildItemContextMenu', original => async function ZoteroPane_buildItemContextMenu() {
      self.debug('patched menu')
      await original.apply(this, arguments) // eslint-disable-line prefer-rest-params
      try {
        const menuitem = self.globals.document.getElementById('prosec-link')
        const actions = self.actions()
        menuitem.hidden = actions.length === 0
        self.debug({ patched: 'menu', actions })
      }
      catch (err) {
        self.debug({ error: err.message })
      }
    })
    this.debug('patched, loaded')
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
        const del: string = Zotero.Prefs.get(`prosec-linker.${type}.delete.${n}`)
        const url: string = Zotero.Prefs.get(`prosec-linker.${type}.url.${n}`)
        const name: string = Zotero.Prefs.get(`prosec-linker.${type}.name.${n}`)
        if (name && url) {
          templates.push({ type: (type as 'doi' | 'title' | 'pdf'), name, url, action: del ? 'delete' : 'add' })
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
  private actions(): { item: Item, actions: Action[] }[] {
    const templates = this.templates()
    this.debug({ templates })
    // if no templates are configured, we're done
    if (templates.length === 0) return []

    this.debug({ templates })

    // get selected items
    const actions = (Zotero.getActiveZoteroPane().getSelectedItems() as Item[])
      // ignore notes, annotations and attachments
      .filter((item: Item) => item.isRegularItem())
      // add uninstantiated templates
      .map((item: Item) => {
        const attachments: Item[] = Zotero.Items.get(item.getAttachments())

        const fields = {
          title: item.getField('title'),
          doi: this.itemDOI(item),
          pdf: attachments.find(isPDF)?.attachmentFilename.replace(/\.pdf$/i, ''),
        }

        // get existing link-attachments
        const link_attachments: Record<string, Item> = attachments.filter(isURL).reduce((acc: Record<string, Item>, att: Item) => {
          acc[att.getField('url')] = att
          return acc
        }, {})

        this.debug({
          link_attachments : Object.keys(link_attachments),
          fields,
          attachments: attachments.map((att: Item) => ({
            linkMode: att.attachmentLinkMode,
            contentType: att.attachmentContentType,
            filename: att.attachmentFilename,
          })),
        })

        return {
          item,
          actions: templates
            // try to fill out the templates
            .map((template: Template): Action => {
              const url = fields[template.type] ? template.url.replace(`{${template.type.toUpperCase()}}`, encodeURIComponent(fields[template.type])) : ''

              if (!url) return null // no template ?

              if (template.action === 'add' && !link_attachments[url]) {
                return {
                  action: 'add',
                  url,
                  name: template.name,
                }
              }

              if (template.action === 'delete' && link_attachments[url]) {
                return {
                  action: 'delete',
                  attachment: link_attachments[url],
                }
              }

              return null
            })
            // select the filled out templates
            .filter((action: Action) => action),
        }
      })
      // select those items that still actions to perform
      .filter((item: { item: Item, actions: Action[] }) => item.actions.length > 0) // eslint-disable-line @typescript-eslint/no-unused-vars

    this.debug(actions)
    return actions
  }

  // create the link attachments
  public async link() {
    let att
    try {
      for (const { item, actions } of this.actions()) {
        for (const action of actions) {
          switch (action.action) {
            case 'add':
              att = new Zotero.Item(this.attachmentTypeID)
              att.parentItemID = item.id
              att.setField('title', action.name)
              att.setField('url', action.url)
              att.attachmentLinkMode = Zotero.Attachments.LINK_MODE_LINKED_URL
              await att.saveTx()
              break
            case 'delete':
              await Zotero.Items.trashTx(action.attachment.id)
              break
          }
        }
      }
    }
    catch (err) {
      this.debug({ error: err.message })
    }
  }
}

Zotero.ProsecLinker = new ProsecLinker
