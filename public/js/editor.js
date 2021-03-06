const API = '/api/'

const INCREASE = 1
const DECREASE = -1
const SORT_ARROW = {
  '1': 'arrow_downward',
  '-1': 'arrow_upward'
}

class Editor {
  constructor (pcmId) {
    var self = this

    this.server = null
    this.connected = false
    this.connectedToEditSession = false
    this.packets = [] // A queue that contains all packet waiting to be sent to the server
    this.sendPacketsTimeout = null // The timeout that send packet to the server

    /* views */
    this._view = null
    this.views = {
      pcm: document.getElementById('pcmView'),
      chart: document.getElementById('chartView')
    }

    this.viewsButtons = {}
    for (var view in this.views) {
      (function () {
        var _view = view
        self.viewsButtons[_view] = document.getElementById(_view + 'ViewButton')
        self.viewsButtons[_view].addEventListener('click', function () {
          self.view = _view
        })
      })()
    }

    this.view = 'pcm'

    this.chartFactory = new ChartFactory(this)

    /* chat */
    this._chatVisible = false
    this.chatUnreadMessage = 0
    this.chatAutoscroll = true // auto scroll when new message
    this.chat = document.getElementById('chat')
    this.chatButton = document.getElementById('chatButton')
    this.chatButtonIcon = document.getElementById('chatButtonIcon')
    this.chatButtonBadge = document.getElementById('chatButtonBadge')
    this.chatButton.addEventListener('click', function () {
      self.chatVisible = !self.chatVisible
    })
    this.chatTopBar = document.getElementById('chatTopBar')
    this.chatMessageList = document.getElementById('chatMessageList')
    this.chatMessageList.addEventListener('scroll', function (e) {
      self.chatAutoscroll = self.chatMessageList.scrollTop + self.chatMessageList.offsetHeight >= self.chatMessageList.scrollHeight
      self.chatTopBar.className = self.chatMessageList.scrollTop > 0
        ? 'scrolled'
        : ''
      self.chatMessageInput.className = self.chatMessageList.scrollTop + self.chatMessageList.offsetHeight < self.chatMessageList.scrollHeight
        ? 'scrolledBottom'
        : ''
    })
    this.chatMessageInput = document.getElementById('chatMessageInput')
    this.chatMessageInput.addEventListener('keyup', function (e) {
      if (e.keyCode == 13 && self.chatMessageInput.value.length > 0) {
        self.emit('message', self.chatMessageInput.value)
        self.chatMessageInput.value = ''
      }
    })

    /* pcm */
    this.pcmId = pcmId
    this.pcm = null
    this.productMathing = 0
    this.sortId = null
    this.sortOrder = null // INCREASE or DECREASE
    this.sortedFeatures = [] // list of {feature: the feature, order: INCREASE or DECREASE}
    this._selectedCell = null
    this.updateTimeout = null

    this.pcmName = document.getElementById('pcmName')
    this.pcmSource = document.getElementById('pcmSource')
    this.pcmAuthor = document.getElementById('pcmAuthor')
    this.pcmLicense = document.getElementById('pcmLicense')

    this.showConfiguratorButton = document.getElementById('showConfiguratorButton')
    this.showConfiguratorButton.addEventListener('click', function () {
      self.div.className = self.div.className === 'configuratorHidden'
        ? ''
        : 'configuratorHidden'

      self.showConfiguratorButton.innerHTML = self.div.className === 'configuratorHidden'
        ? 'Show the configurator'
        : 'Hide the configurator'
    })

    this.div = document.getElementById('editor')
    this.editorContent = document.getElementById('editorContent')

    this.pcmView = document.getElementById('pcmView')
    this.pcmDiv = document.getElementById('pcm')
    this.pcmContent  = document.getElementById('pcmContent')
    this.pcmContent.addEventListener('scroll', function (event) {
      var top = self.pcmContent.scrollTop
      self.pcmFeatures.className = top > 0
        ? 'scrolled'
        : ''
      var left = self.pcmFeatures.scrollLeft = self.pcmContent.scrollLeft
      self.fixedFeaturesName.style.left = self.pcmFeatures.scrollLeft + 'px'
      self.fixedFeaturesColumn.style.left = left + 'px'
      self.configurator.className = self.fixedFeaturesName.className = self.fixedFeaturesColumn.className = left > 0
        ? 'scrolledRight'
        : ''
      self.updatePCMView()
    })
    this.configurator = document.getElementById('configurator')
    this.configuratorTitle = document.getElementById('configuratorTitle')
    this.configuratorContent = document.getElementById('configuratorContent')
    this.configuratorContent.addEventListener('scroll', function () {
      self.configuratorTitle.className = self.configuratorContent.scrollTop > 0
        ? 'scrolled'
        : ''
    })
    this.pcmFeatures = document.getElementById('pcmFeatures')
    this.fixedFeaturesName = document.getElementById('fixedFeaturesName')
    this.pcmProducts = document.getElementById('pcmProducts')
    this.fixedFeaturesColumn = document.getElementById('fixedFeaturesColumn')

    this.filters = []
    this.filtersByFeatureId = {}

    /* cell edition */
    this.actionList = new ActionList(this)

    this.cellEdit = document.getElementById('cellEdit')
    this.closeCellEditButton = document.getElementById('closeCellEditButton')
    this.closeCellEditButton.addEventListener('click', function () {
      self.selectedCell = null
    })
    this.cellEditType = document.getElementById('cellEditType')
    this.cellEditType.addEventListener('click', function (e) {
      if (self.selectedCell) {
        var value = null
        if (self.selectedCell.type == 'date') {
          value = 'Not a date : ' + self.selectedCell.value.toISOString()
        } else if (self.selectedCell.type !== 'multiple') {
          value = []
          if (self.cellEditInput.value.length > 0) {
            value = [self.cellEditInput.value]
            self.cellEditInput.value = ''
          }
        } else {
          value = self.selectedCell.value.length > 0
            ? self.selectedCell.value.join(', ')
            : self.cellEditInput.value
        }
        self.cellEditInput.focus()
        self.editCell(self.selectedCell, value)
      }
    })
    this.cellEditInputWrap = document.getElementById('cellEditInputWrap')
    this.cellEditInput = document.getElementById('cellEditInput')
    this.cellEditInput.addEventListener('keyup', function (e) {
      if (e.keyCode === 13) { // edit on enter
        if (self.connectedToSession) {
          if (self.editType !== 'multiple') { // edit not multiple
            self.editCell(self.selectedCell, self.cellEditInput.value)
          } else {
            if (self.cellEditInput.value.length > 0) { // edit multiple
              self.editCell(self.selectedCell, self.selectedCell.value.concat(self.cellEditInput.value.replace(/^\s+|\s+$/g, '')))
              self.cellEditInput.value = ''
            }
          }
        } else {
          alert('Your not connected to the edit sesion')
        }
      } else if (self.editType !== 'multiple') {
        self.editType = detectType(self.cellEditInput.value).type
      }
    })
    this.cellEditDatePicker = new DatePicker(null, function () {
      self.editCell(self.selectedCell, self.cellEditDatePicker.date.toISOString())
    })
    this.cellEditDatePicker.button.style.display = 'none'
    this.cellEditDatePicker.appendTo(this.cellEditInputWrap)

    /* pcm edition */
    this.editAction = document.getElementById('editAction')

    this.addProductButton = document.getElementById('addProductButton')
    this.addProductButton.addEventListener('click', function () {
      if (self.connectedToSession) {
        self.emit('addProduct')
      } else {
        alert('Your not connected to the edit sesion')
      }
    })

    this.addFeatureButton = document.getElementById('addFeatureButton')
    this.addFeaturePopupContent = document.createElement('div')
    this.addFeatureInput = new TextField('Name')
    this.addFeatureInput.appendTo(this.addFeaturePopupContent)
    this.addFeaturePopup = new Popup('Create a new feature', this.addFeaturePopupContent, {
      'CANCEL': function () {
        self.addFeaturePopup.hide()
      },
      'CREATE': function () {
        self.emit('addFeature', self.addFeatureInput.value)
        self.addFeatureInput.value = ''
        self.addFeaturePopup.hide()
      }
    })
    this.addFeatureButton.addEventListener('click', function () {
      if (self.connectedToSession) {
        self.addFeaturePopup.show()
        self.addFeatureInput.focus()
      } else {
        alert('Your not connected to the edit sesion')
      }
    })

    /**
     * Apply function
     * Iterate over every cell of a specified feature to apply a function coded by the user
     */
    this.applyFunctionFeature = null
    this.applyFunctionContent = document.createElement('div')
    this.applyFunctionContent.appendChild(document.createTextNode('The following javascript code will be applied to every cells of the feature '))
    this.applyFunctionFeatureName = document.createElement('span')
    this.applyFunctionFeatureName.className = 'textPrimary'
    this.applyFunctionContent.appendChild(this.applyFunctionFeatureName)
    this.applyFunctionContent.appendChild(document.createTextNode(' that '))
    var b = document.createElement('b')
    b.innerText = 'match the configurator'
    this.applyFunctionContent.appendChild(b)
    this.applyFunctionContent.appendChild(document.createTextNode(' (the entire product has to match the configurator, not just the cell).'))
    this.applyFunctionEditorDiv = document.createElement('div')
    this.applyFunctionEditorDiv.setAttribute('id', 'applyFunctionEditor')
    this.applyFunctionEditorDiv.innerHTML = '/*\n' +
      ' * cell is the cell to modify\n' +
      ' * example: if (cell.value === \'?\') cell.value = 0\n' +
      ' * it\'s useless to edit cell.type, because it\'s automatically recomputed\n' +
      ' * other example to delete all [x] (x is a number) :\n' +
      ' *   if (cell.type == \'string\') cell.value = cell.value.replace(/\\[\\d+\\]/g, \'\')\n' +
      ' * another example to keep the first number :\n' +
      ' *   var res = /\\d+/.exec(cell.value)\n' +
      ' *   cell.value = res\n' +
      ' *     ? res[0]\n' +
      ' *     : 0\n' +
      ' * No need to parse the result of the regex, the type detection will do that for u :-)\n' +
      ' */\n' +
      'cell.value = '
    this.applyFunctionContent.appendChild(this.applyFunctionEditorDiv)
    this.applyFunctionEditor = ace.edit(this.applyFunctionEditorDiv)
    this.applyFunctionEditor.session.setMode('ace/mode/javascript')
    this.applyFunctionError = document.createElement('div')
    this.applyFunctionError.className = 'textError'
    this.applyFunctionContent.appendChild(this.applyFunctionError)
    this.applyFunctionPopup = new Popup('Apply function', this.applyFunctionContent, {
      'CANCEL': function () { self.applyFunctionPopup.hide() },
      'APPLY': function () {
        var error = false
        self.applyFunctionError.innerHTML = ''

        for (var p = 0, lp = self.pcm.products.length; p < lp && !error; p++) {
          var feature = self.applyFunctionFeature
          var product = self.pcm.products[p]
          var cell = product.cellsByFeatureId[feature.id]
          if (product.match) {
            var previousValue = cell.cloneValue()
            try {
              eval(self.applyFunctionEditor.getValue())
              if (cell.value !== previousValue) {
                var value = cell.value
                cell.value = previousValue // Restore previous value, only server callback will change it
                self.editCell(cell, value, p > 0)
              }
            } catch (err) {
              error = true
              if (self.applyFunctionError.innerHTML.length > 0) self.applyFunctionError.innerHTML += '<br>'
              self.applyFunctionError.innerHTML = 'Cell ' + p + ' : ' + err.message
            }
          }
        }
        if (!error) self.applyFunctionPopup.hide()
      }
    })

    /* pcm data edition */
    this.editPCMButton = document.getElementById('editPCMButton')
    this.editPCMButton.addEventListener('click', function () {
      self.editPCMPopup.show()
    })
    this.editPCMContent = document.createElement('div')
    this.editPCMName = new TextField('Name')
    this.editPCMName.appendTo(this.editPCMContent)
    this.editPCMSource = new TextField('Source')
    this.editPCMSource.appendTo(this.editPCMContent)
    this.editPCMAuthor = new TextField('Author')
    this.editPCMAuthor.appendTo(this.editPCMContent)
    this.editPCMLicense = new TextField('License')
    this.editPCMLicense.appendTo(this.editPCMContent)
    this.editPCMDescription = new TextField('Description', 'area')
    this.editPCMDescription.appendTo(this.editPCMContent)
    this.editPCMPopup = new Popup('Edit', this.editPCMContent, {
      'CANCEL': function () {
        self.editPCMPopup.hide()
      },
      'OK': function () {
        if (self.connectedToSession) {
          self.emit('editPCM', {
            name: self.editPCMName.value,
            source: self.editPCMSource.value,
            author: self.editPCMAuthor.value,
            license: self.editPCMLicense.value,
            description: self.editPCMDescription.value
          })
          self.editPCMPopup.hide()
        } else {
          alert('Your not connected to the edit sesion')
        }
      }
    })

    /* Bind keyboard events */
    window.addEventListener('keydown', function (e) {
      if (e.ctrlKey) {
        var key = String.fromCharCode(e.which).toLowerCase()
        if (key == 'z') { // Undo
          e.preventDefault()
          e.stopPropagation()
          self.actionList.undo()
        } else if (key == 'y') { // redo
          e.preventDefault()
          e.stopPropagation()
          self.actionList.redo()
        }
      }
    })

    this.loadPCM()
  }

  get view () {
    return this._view
  }

  set view (value) {
    if (this.view != value) {
      if (this.view) {
        this.viewsButtons[this.view].className = ''
        this.views[this.view].style.display = 'none'
      }
      this._view = value
      this.viewsButtons[this.view].className = 'active'
      this.views[this.view].style.display = 'block'
      if (this.view === 'pcm' && this.pcm != null) {
        this.updatePCMView()
      } else if (this.view === 'chart' && this.chartFactory.chart == null) {
        this.chartFactory.drawChart('productChart')
      }
    }
  }

  get chatVisible () {
    return this._chatVisible
  }

  set chatVisible (value) {
    this._chatVisible = value
    if (this.chatVisible) {
      this.chat.className = 'visible'
      this.chatButtonIcon.innerHTML = 'close'
      this.chatUnreadMessage = 0
      this.chatButtonBadge.innerHTML = ''
      this.chatButtonBadge.className = 'badge' // remove visible
      this.chatMessageInput.focus()
    } else {
      this.chat.className = ''
      this.chatButtonIcon.innerHTML = 'chat'
    }
  }

  get selectedCell () {
    return this._selectedCell
  }

  set selectedCell (value) {
    var self = this

    if (this.selectedCell) {
      this.selectedCell.div.className = 'pcmCell' // remove selected
      // Reset state
      this.cellEditInput.style.display = 'inline-block'
      this.cellEditDatePicker.visible = false
      this.cellEditDatePicker.button.style.display = 'none'
      this.removeAllEditChips()
      if (value == null) this.pcmView.className = ''
    } else if (value) {
      this.pcmView.className = 'cellEditVisible'
    }

    this._selectedCell = value
    if (this.selectedCell != null) {
      this.selectedCell.div.className = 'pcmCell selected'
      this.editType = this.selectedCell.type

      if (this.editType === 'multiple') {
        this.cellEditInput.value = ''
        for (var i = 0, li = this.selectedCell.value.length; i < li; i++) {
          this.addEditChips(this.selectedCell.value[i])
        }
      } else if (this.editType === 'date') {
        this.cellEditInput.style.display = 'none'
        this.cellEditDatePicker.date = this.selectedCell.value
        this.cellEditDatePicker.button.style.display = 'inline-block'
      } else {
        this.cellEditInput.value = this.selectedCell.valueForExport
      }
      this.cellEditInput.select()
    }
  }

  get editType () {
    return this._editType
  }

  set editType (value) {
    this._editType = value
    this.cellEditType.innerHTML = this.editType
    this.cellEditInputWrap.style.width = (this.cellEdit.offsetWidth - 56 - this.cellEditType.offsetWidth - 5 - 26) + 'px'
    this.cellEditInput.style.width = this.editType === 'multiple'
      ? '0'
      : this.cellEditInputWrap.offsetWidth + 'px'
  }

  /**
   * Use this function to edit a cell,
   * it will send the editCell event to the server and store the previous value for possible undo
   * @param {Cell} cell - the cell to edit
   * @param {} value - the new value
   * @param {boolean} stack - Refer to ActionList.push stack parameter
   */
  editCell (cell, value, stack = false) {
    this.actionList.push(new CellEditAction(cell, value), stack)
  }

  /**
   * Add a chips to the edit cell input (used for multiple value)
   * @param {string} value - the value of the chips
   */
  addEditChips (value) {
    var self = this
    var chips = document.createElement('div')
    chips.className = 'chips'
    chips.innerHTML = value
    var chipsDelete = document.createElement('div')
    chipsDelete.className = 'chipsDelete'
    chipsDelete.addEventListener('click', function () {
      if (self.connectedToSession) {
        self.cellEditInputWrap.removeChild(chips)
        var arr = self.selectedCell.value.slice()
        arr.splice(arr.indexOf(value), 1)
        self.editCell(self.selectedCell, arr)
      } else {
        alert('Not connected to edit session')
      }
    })
    chips.appendChild(chipsDelete)
    this.cellEditInputWrap.insertBefore(chips, this.cellEditInput)
    this.cellEditInputWrap.scrollLeft = this.cellEditInputWrap.offsetWidth
  }

  removeAllEditChips () {
    while (this.cellEditInputWrap.firstChild !== this.cellEditInput) {
      this.cellEditInputWrap.removeChild(this.cellEditInputWrap.firstChild)
    }
  }

  loadPCM () {
    var self = this

    //console.time('get pcm')

    var r = new XMLHttpRequest()
    r.open('GET', API + this.pcmId, true)
    r.setRequestHeader('Pragma', 'no-cache')
    r.onreadystatechange = function () {
      if (r.readyState != 4 || r.status != 200) return

      var data = JSON.parse(r.responseText)
      //console.timeEnd('get pcm')

      if (data == null) {
        alert('pcm ' + self.pcmId + ' doesn\'t exists')
      } else if (typeof data.error !== 'undefined') {
		console.error(data.error)
		var message = typeof data == 'string'
		  ? data
		  : data.message || 'Unknown error'
        alert(data.error)
      } else {
        self.pcm = new PCM(data, true)
        self.pcmLoaded()
      }
    }
    r.send()
  }

  pcmLoaded () {
    var self = this

    this.updatePCMData()

    this.updateConfiguratorTitle()

    // sort pcm
    this.sort(this.pcm.primaryFeature)

    // create filters
    for (var f = 0, lf = this.pcm.features.length; f < lf; f++) {
      this.createFilter(this.pcm.features[f])
    }

    // bind click to cells
    for (var p = 0, lp = this.pcm.products.length; p < lp; p++) {
      this.bindProduct(this.pcm.products[p])
    }

    // add features, products and filter to the DOM
    if (this.pcm.primaryFeature) {
      this.pcm.primaryFeature.fixed = true
      this.fixedFeaturesName.appendChild(this.pcm.primaryFeature.div)
      this.fixedFeaturesColumn.appendChild(this.pcm.primaryFeature.column)
      this.configuratorContent.appendChild(this.filtersByFeatureId[this.pcm.primaryFeatureId].div)
    }
    for (var f = 0, lf = this.pcm.features.length; f < lf; f++) {
      var feature = self.pcm.features[f]
      this.bindFeature(feature)
      if (feature.id != self.pcm.primaryFeatureId) {
        self.pcmFeatures.appendChild(feature.div)
        self.pcmProducts.appendChild(feature.column)
        self.configuratorContent.appendChild(self.filtersByFeatureId[feature.id].div)
      }
    }

    if (document.fonts) { // If browser support fonts API wait before computing width, else width will be computed with the wrong font
      document.fonts.ready.then(function () {
        self.computeFeaturesWidth()
        self.updatePCMView()
        self.chartFactory.init()
        self.connect()
      })
    } else {
      this.computeFeaturesWidth()
      this.updatePCMView()
      this.chartFactory.init()
      this.connect()
    }
  }

  updatePCMView () {
    var height = this.pcm.productsShown * 48 // 48 is the height of a product
    this.fixedFeaturesColumn.style.height = height + 'px'
    this.pcmProducts.style.height = height + 'px'
    this.pcm.updateColumns(this.pcmContent.scrollTop, this.pcmContent.clientHeight)
  }
  /**
   * Compute the width of every features
   */
  computeFeaturesWidth () {
    for (var f = 0, lf = this.pcm.features.length; f < lf; f++) {
      this.pcm.features[f].computeWidth()
    }
    this.computeFixedWidth()
  }

  updatePCMData () {
    this.pcmName.innerHTML = this.pcm.name || 'No name'

    this.pcmSource.innerHTML = this.pcm.source == null || this.pcm.source.length == 0
      ? 'unknown'
      : isUrl(this.pcm.source)
        ? '<a href="' + this.pcm.source + '" target="_blank">' + this.pcm.source + '</a>'
        : this.pcm.source

    this.pcmAuthor.innerHTML = this.pcm.author || 'unknown'
    this.pcmLicense.innerHTML = this.pcm.license || 'unknown'

    this.editPCMName.value = this.pcm.name
    this.editPCMSource.value = this.pcm.source
    this.editPCMAuthor.value = this.pcm.author
    this.editPCMLicense.value = this.pcm.license
    this.editPCMDescription.value = this.pcm.description

    this.productMathing = this.pcm.products.length
  }

  /**
   * Bind user event to the product (click)
   * @param {Product} product - the product
   */
  bindProduct (product) {
    var self = this
    for (var c = 0, lc = product.cells.length; c < lc; c++) {
      this.bindCell(product.cells[c])
    }
  }

  /**
   * Bind user event to the cell (click)
   * @param {Cell} cell - the cell
   */
  bindCell (cell) {
    var self = this

    cell.div.addEventListener('click', function () {
      self.selectedCell = cell
    })

    cell.div.addEventListener('contextmenu', function (e) {
      e.preventDefault()
      var contextMenu = new ContextMenu({
        'Edit': function () { self.selectedCell = cell },
        'Inspect...': function () {
          var content = document.createElement('div')
          content.innerHTML = '<b>value :</b> ' + cell.value + '<br>' +
            '<b>type :</b> ' + cell.type + '<br>' +
            '<b>is partial :</b> ' + cell.isPartial + '<br>' +
            '<b>unit :</b> ' + cell.unit + '<br>'
          if (cell.type === 'image') content.innerHTML += cell.html
          var popup = new Popup('Cell', content, {
            'CLOSE': function () { popup.delete() }
          })
          popup.show()
        }
      }, true)
      contextMenu.show(e.pageX, e.pageY)
    })
  }

  /**
   * Bind user event to the feature (sort, fix)
   * @param {Feature} feature - the feature
   */
  bindFeature (feature) {
    var self = this

    feature.div.addEventListener('click', function (e) {
      self.sort(feature)
    })

    feature.div.addEventListener('dblclick', function (e) {
      console.log('plop')
      self.sort(feature, true)
    })

    feature.div.addEventListener('contextmenu', function (e) {
      e.preventDefault()
      var contextMenu = new ContextMenu({
        'Rename...': function () {
          var popupContent = document.createElement('div')
          var featureName = new TextField('Feature name')
          featureName.value = feature.name
          featureName.appendTo(popupContent)
          var popup = new Popup ('Rename ' + feature.name, popupContent, {
            'CANCEL': function () { popup.delete() },
            'RENAME': function () {
              self.emit('renameFeature', {featureId: feature.id, name: featureName.value})
              popup.delete()
            }
          })
          popup.show()
          featureName.focus()
        },
        'Remove': function () {
          self.actionList.push(new RemoveFeatureAction(feature))
        },
        'Inspect...': function () {
          var content = document.createElement('div')
          content.innerHTML = '<b>name :</b> ' + feature.name + '<br>' +
            '<b>id :</b> ' + feature.id + '<br>' +
            '<b>type :</b> ' + feature.type + '<br>'
          var popup = new Popup('Feature', content, {
            'CLOSE': function () { popup.delete() }
          })
          popup.show()
        },
        'Apply function...': function () {
          self.showApplyFunction(feature)
        }
      }, true)
      contextMenu.show(e.pageX, e.pageY)
    })

    feature.fixButton.addEventListener('click', function (e) {
      if (e.button === 0) {
        e.stopPropagation()
        e.preventDefault()
        if (feature.fixed) self.unfixFeature(feature)
        else self.fixFeature(feature)
      }
    })
  }

  /**
   * Show the apply function popup for the specified feature
   * @param {Feature} feature - The feature
   */
  showApplyFunction (feature) {
    this.applyFunctionFeature = feature
    this.applyFunctionFeatureName.innerHTML = feature.name
    this.applyFunctionPopup.show()
    this.applyFunctionEditor.focus()
    this.applyFunctionEditor.navigateFileEnd()
  }

  createFilter (feature) {
    var filter = new Filter(this, feature)
    this.filters.push(filter)
    this.filtersByFeatureId[feature.id] = filter

    return filter
  }

  fixFeature (feature) {
    feature.fixed = true
    this.pcmFeatures.removeChild(feature.div)
    this.pcmProducts.removeChild(feature.column)
    if (feature.id === this.pcm.primaryFeatureId) {
      this.fixedFeaturesName.insertBefore(feature.div, this.fixedFeaturesName.firstChild)
      this.fixedFeaturesColumn.insertBefore(feature.column, this.fixedFeaturesColumn.firstChild)
    } else {
      var nextName = null
      var nextColumn = null
      var found = false
      for (var f = 0, lf = this.pcm.features.length; f < lf; f++) {
        if (found && this.pcm.features[f].fixed && this.pcm.features[f].id !== this.pcm.primaryFeatureId) {
          nextName = this.pcm.features[f].div
          nextColumn = this.pcm.features[f].column
          break
        } else if (!found && this.pcm.features[f].id === feature.id) found = true
      }
      this.fixedFeaturesName.insertBefore(feature.div, nextName)
      this.fixedFeaturesColumn.insertBefore(feature.column, nextColumn)
    }
    this.computeFixedWidth()
  }

  unfixFeature (feature) {
    feature.fixed = false
    this.fixedFeaturesName.removeChild(feature.div)
    this.fixedFeaturesColumn.removeChild(feature.column)
    if (feature.id === this.pcm.primaryFeatureId) {
      this.pcmFeatures.insertBefore(feature.div, this.pcmFeatures.firstChild)
      this.pcmProducts.insertBefore(feature.column, this.pcmProducts.firstChild)
    } else {
      var nextName = null
      var nextColumn = null
      var found = false
      for (var f = 0, lf = this.pcm.features.length; f < lf; f++) {
        if (found && !this.pcm.features[f].fixed && this.pcm.features[f].id !== this.pcm.primaryFeatureId) {
          nextName = this.pcm.features[f].div
          nextColumn = this.pcm.features[f].column
          break
        } else if (!found && this.pcm.features[f].id === feature.id) found = true
      }
      this.pcmFeatures.insertBefore(feature.div, nextName)
      this.pcmProducts.insertBefore(feature.column, nextColumn)
    }
    this.computeFixedWidth()
  }

  computeFixedWidth () {
    this.pcmFeatures.style.paddingLeft = this.fixedFeaturesName.offsetWidth + 'px'
    this.pcmProducts.style.paddingLeft = this.fixedFeaturesColumn.offsetWidth + 'px'
  }

  sort (feature, reset = false) {
    if (reset) {
      for (var i = 0, li = this.sortedFeatures.length; i < li; i++) {
        this.sortedFeatures[i].feature.div.classList.remove('sorted')
        this.sortedFeatures[i].feature.sortIcon.innerHTML = ''
        this.sortedFeatures[i].feature.sortNumber.innerHTML = ''
      }
      this.sortedFeatures = [{
        feature: feature,
        order: INCREASE
      }]
      feature.div.classList.add('sorted')
      feature.sortIcon.innerHTML = SORT_ARROW[INCREASE]
      feature.sortNumber.innerHTML = this.sortedFeatures.length
    } else {
      let index = -1
      for (var i = 0, li = this.sortedFeatures.length; i < li; i++) {
        if (this.sortedFeatures[i].feature.id === feature.id) {
          index = i
          break
        }
      }
      if (index !== -1) {
        feature.sortIcon.innerHTML = SORT_ARROW[(this.sortedFeatures[index].order *= -1)]
        feature.sortNumber.innerHTML = index + 1
      } else {
        this.sortedFeatures.push({
          feature: feature,
          order: INCREASE
        })
        feature.div.classList.add('sorted')
        feature.sortIcon.innerHTML = SORT_ARROW[INCREASE]
        feature.sortNumber.innerHTML = this.sortedFeatures.length
      }
    }

    this.pcm.sort(this.sortedFeatures)
    this.updatePCMView()
  }

  updateConfiguratorTitle () {
    this.configuratorTitle.innerHTML = this.pcm.products.length > 0
      ? this.productMathing + ' / ' + this.pcm.products.length +
        ' (' + Math.round((this.productMathing / this.pcm.products.length) * 10000) / 100 + '%)'
      : 'PCM is empty'
  }

  filterChanged (filter) {
    var self = this

    this.productMathing = 0
    for (var p = 0, lp = this.pcm.products.length; p < lp; p++) {
      var product = this.pcm.products[p]
      product.cellsByFeatureId[filter.feature.id].match = filter.match(product)
      if (product.match) {
        this.productMathing++
        product.show = true
      } else {
        product.show = false
      }
    }

    // The timeout is here to prevent lags due to too frequent changes
    if (this.updateTimeout) clearTimeout(this.updateTimeout)
    this.updateTimeout = setTimeout(function () {
      self.updatePCMView()
      self.updateConfiguratorTitle()
      self.chartFactory.updateChart()
      self.updateTimeout = null
    }, 100)
  }

  /**
   * Connect to the edit session using socket.io and bind events
   */
  connect () {
    if (user == null) return
    if (this.server != null) return false
    var self = this
    var res = /token=([^;]+)/.exec(document.cookie)
    var token = res != null
      ? res[1]
      : null
    if (token) {
      this.server = io.connect()

      this.server.on('connect', function () {
        self.connected = true
        self.server.emit('handshake', {
          pcmId: self.pcmId,
          token: token
        })
      })

      this.server.on('disconnect', function () {
        console.log('disconnected from server')
        self.connected = self.connectedToSession = false
        self.pcmView.className = '' // remove cellEditVisible
        self.cellEdit.className = 'disable'
        self.editAction.className = 'actionGroup notConnected'
        self.chatVisible = false
        setTimeout(function () {
          self.chat.style.display = 'none'
          self.chatButton.style.display = 'none'
        }, 200)
        self.server = null
      })

      this.server.on('packets', function (packets) {
        var featuresToUpdate = []
        var initChartFactory = false
        //console.log('received ' + packets.length + ' packets')

        for (var p = 0, lp = packets.length; p < lp; p++) {
          (function (action, data) {
            if (action == 'err') {
              console.error(data)
              var message = typeof data == 'string'
                ? data
                : data.message || 'Unknown error'
              alert('Error: ' + data)
            } else if (action == 'connectedToSession') {
              self.connectedToSession = true
              self.cellEdit.className = ''
              self.editAction.className = 'actionGroup'
              self.chat.style.display = 'block'
              self.chatButton.style.display = 'block'
            } else if (action == 'updateUsersList') {
              self.chatTopBar.innerHTML = data.length > 1
                ? data.length + ' people connected'
                : 'You\'re alone :-('
            } else if (action == 'editCell') { // Edit cell
              var cell = self.pcm.productsById[data.productId].cellsByFeatureId[data.featureId]
              cell.setValue(data.value, data.type)
              if (featuresToUpdate.indexOf(cell.feature.id) == -1) featuresToUpdate.push(cell.feature.id)
              if (cell == self.selectedCell) {
                self.selectedCell = cell
              }
              initChartFactory = true
            } else if (action == 'addProduct') {
              self.bindProduct(self.pcm.addProduct(data, true))
              self.updatePCMView()
              // The new product is always matching (else user won't see it)
              self.productMathing++
              self.updateConfiguratorTitle()
            } else if (action == 'renameFeature') {
              var feature = self.pcm.featuresById[data.featureId]
              feature.name = data.name
              feature.computeWidth()
              if (feature.fixed) self.computeFixedWidth()
            } else if (action == 'addFeature') {
              data = self.pcm.addFeature(data)
              self.bindFeature(data.feature)
              self.pcmFeatures.appendChild(data.feature.div)
              self.pcmProducts.appendChild(data.feature.column)
              data.feature.computeWidth()
              self.configuratorContent.appendChild(self.createFilter(data.feature).div)
              for (var i in data.cellsByProductId) {
                self.bindCell(data.cellsByProductId[i])
              }
              self.updatePCMView()
              initChartFactory = true
            } else if (action == 'removeFeature') {
              var feature = self.pcm.featuresById[data]
              if (feature) {
                if (feature.fixed) {
                  self.fixedFeaturesName.removeChild(feature.div)
                  self.fixedFeaturesColumn.removeChild(feature.column)
                  self.computeFixedWidth()
                } else {
                  self.pcmFeatures.removeChild(feature.div)
                  self.pcmProducts.removeChild(feature.column)
                }
                self.configuratorContent.removeChild(self.filtersByFeatureId[data].div)
                self.pcm.removeFeature(data)
              }
              initChartFactory = true
            } else if (action == 'editPCM') {
              self.pcm.name = data.name
              self.pcm.source = data.source
              self.pcm.author = data.author
              self.pcm.license = data.license
              self.pcm.description = data.description
              self.updatePCMData()
            } else if (action == 'message') {
              self.chatMessageList.innerHTML += '<div class="chatMessage"><div class="chatMessagePseudo">' + data.pseudo + '</div>'
                + '<div class="chatMessageContent">' + data.message + '</div></div>'
              if (self.chatAutoscroll) {
                self.chatMessageList.scrollTop = self.chatMessageList.scrollHeight
              }

              if (!self.chatVisible) {
                self.chatButtonBadge.innerHTML = ++self.chatUnreadMessage
                self.chatButtonBadge.className = 'badge visible'
              }
            } else {
              alert('Error, unkown action : ' + action)
            }
          })(packets[p].action, packets[p].data)
        }

        for (var f = 0, lf = featuresToUpdate.length; f < lf; f++) {
          var feature = self.pcm.featuresById[featuresToUpdate[f]]
          feature.computeData()
          var filter = self.filtersByFeatureId[feature.id]
          var matchAll = filter.matchAll
          filter.buildFilter()
          if (!matchAll) self.filterChanged(filter)
          feature.computeWidth()
          if (feature.fixed) self.computeFixedWidth()
        }

        if (initChartFactory) self.chartFactory.init()
      })
    }
  }

  disconnect () {
    if (this.server && this.connected) this.server.disconnect()
  }

  emit (action, data) {
    var self = this

    if (this.server == null) console.log('No server')
    else {
      if (action == 'handshake') this.server.emit(action, data)
      else {
        if (this.sendPacketsTimeout) clearTimeout(this.sendPacketsTimeout)

        this.packets.push({
          action: action,
          data: data
        })

        this.sendPacketsTimeout = setTimeout(function () {
          //console.log('send ' + self.packets.length + ' packets (' + JSON.stringify(self.packets).length + ' B)')
          self.server.emit('packets', self.packets)
          self.packets = []
          self.sendPacketsTimeout = null
        }, 100)
      }
    }
  }
}
