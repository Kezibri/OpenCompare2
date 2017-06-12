var browser = typeof window !== 'undefined'

if (!browser) {
  detectType = require('./typeDetection.js').detectType
}

class Cell {
  constructor (data, product, isFromDB = false) {
    this.product = product

    if (typeof data.id !== 'string') console.error('cell id is incorrect (value : ' + data.id + ', type : ' + typeof data.id + ')')
    if (typeof this.product.cellsById[data.id] !== 'undefined') console.error('cell id already exists')
    this.id = data.id

    if (typeof data.featureID !== 'undefined') data.featureId = data.featureID
    if (typeof data.featureId !== 'string') console.error('cell featureId is incorrect')
    this.featureId = data.featureId

    if (browser) {
      this.match = true // used for configurator / filter

      this.div = document.createElement('div')
      this.div.className = 'pcmCell'
    }

    if (isFromDB) {
      this.setValue(data.value, data.type)
    } else {
      this.value = data.value
    }

    this.isPartial = typeof data.isPartial === 'boolean'
      ? data.isPartial
      : false

    this.unit = typeof data.unit === 'string'
      ? data.unit
      : 'undefined'
  }

  get value () {
    return this._value
  }

  set value (value) {
    this.setValue(value)
  }

  setValue (value, type = null) {
    if (type == null) {
      var res = detectType(value)
      value = res.value
      type = res.type
    }

    this._value = value
    this.type = type

    if (browser) {
      this.div.innerHTML = this.html
    }
  }

  get html () {
    var html = ''

    switch (this.type) {
      case 'string':
      case 'number':
      case 'boolean':
      default:
        html += this.value
        break
      case 'url':
        html += '<a href="' + this.value + '" target="_blank">' + this.value + "</a>"
        break
      case 'image':
        html += '<img src="' + this.value + '">'
        break
      case 'multiple':
        for (var i = 0, li = this.value.length; i < li; i++) {
          if (i > 0) html += ', '
          html += this.value[i]
        }
        break
    }

    return html
  }

  export () {
    return {
      id: this.id,
      featureId: this.featureId,
      type: this.type,
      isPartial: this.isPartial,
      unit: this.unit,
      value: this.value
    }
  }
}

if (!browser) {
  module.exports = Cell
}
