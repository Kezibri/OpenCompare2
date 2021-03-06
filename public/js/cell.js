var browser = typeof window !== 'undefined'

if (!browser) {
  detectType = require('./typeDetection.js').detectType
}

class Cell {
  constructor (data, product, isFromDB = false) {
    this.product = product

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

  get feature () {
    return this.product.pcm.featuresById[this.featureId]
  }

  /**
   * Return the value for an export (ex: store in db)
   */
  get valueForExport () {
    if (this.type == 'date') {
      return this.value.toISOString()
    }
    return this.value
  }

  /**
   * Re-detect the type of cell
   */
  retype () {
    this.setValue(this.value)
  }

  setValue (value, type = null) {
    if (type == null) {
      var res = detectType(value)
      value = res.value
      type = res.type
    } else if (type == 'date') {
      value = new Date(value)
    }

    this._value = value
    this.type = type

    if (browser) {
      this.div.innerHTML = this.html
    }
  }

  cloneValue () {
    if (Array.isArray(this.value)) return this.value.slice()
    else if (this.type == 'date') return new Date(this.value)
    else if (typeof this.value === 'object') return Object.assign({}, this.value)
    return this.value
  }

  get html () {
    var html = ''

    switch (this.type) {
      case 'undefined':
        break
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
        html += this.value.join(', ')
        break
      case 'date':
        html += this.value.toLocaleString()
    }

    return html
  }

  export () {
    return {
      featureId: this.featureId,
      type: this.type,
      isPartial: this.isPartial,
      unit: this.unit,
      value: this.valueForExport
    }
  }
}

if (!browser) {
  module.exports = Cell
}
