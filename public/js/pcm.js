var browser = typeof window !== 'undefined'

if (!browser) {
  Product = require('./product.js')
  Feature = require('./feature.js')
}

class PCM {
  constructor (data, isFromDB = false) {
    this._id = isFromDB
      ? data._id
      : null

    // id gen are made to prevent identical id generation (can cause bug when undo/redo addFeature or removeFeature)
    this.featureIdGen = isFromDB
      ? data.featureIdGen
      : 0
    this.productIdGen = isFromDB
      ? data.productIdGen
      : 0

    this.name = typeof data.name === 'string'
      ? data.name
      : null
    if (this.name == null) throw 'PCM name is null !'
    this.description = typeof data.description === 'string'
      ? data.description
      : null
    this.license = typeof data.license === 'string'
      ? data.license
      : null
    this.source = typeof data.source === 'string'
      ? data.source
      : null
    this.author = typeof data.author === 'string'
      ? data.author
      : 'OpenCompare'

    if (typeof data.primaryFeatureID !== 'undefined') data.primaryFeatureId = data.primaryFeatureID
    this.primaryFeatureId = typeof data.primaryFeatureId === 'string'
      ? data.primaryFeatureId
      : null

    this.products = []
    this.productsById = {}
    if (typeof data.products === 'object') {
      for (var p in data.products) {
        var product = new Product(data.products[p], this, isFromDB)
        this.products.push(product)
        this.productsById[product.id] = product
      }
    }

    this.features = []
    this.featuresById = {}
    if (typeof data.features === 'object') {
      for (var f in data.features) {
        var feature = new Feature(data.features[f], this, isFromDB)
        this.features.push(feature)
        this.featuresById[feature.id] = feature
      }
    }
    if (this.primaryFeatureId == null && this.features.length > 0) this.primaryFeatureId = this.features[0].id
  }

  get primaryFeature () {
    return this.featuresById[this.primaryFeatureId] || null
  }

  /**
   * Re-detect the entire pcm (products, cells and features)
   */
  retype () {
    for (var p = 0, lp = this.products.length; p < lp; p++) {
      this.products[p].retype()
    }
    
    for (var f = 0, lf = this.features.length; f < lf; f++) {
      this.features[f].computeData()
    }
  }

  sort (feature = this.primaryFeature, order = 1) {
    //console.time('sort pcm')
    this.products.sort(function (p1, p2) {
      if (p1.cellsByFeatureId[feature.id].type !== p2.cellsByFeatureId[feature.id].type) {
        if (p1.cellsByFeatureId[feature.id].type !== feature.type) return 1
        if (p2.cellsByFeatureId[feature.id].type !== feature.type) return -1
      }
      if (p1.cellsByFeatureId[feature.id].value < p2.cellsByFeatureId[feature.id].value) return -order
      if (p1.cellsByFeatureId[feature.id].value > p2.cellsByFeatureId[feature.id].value) return order
      return 0
    })
    //console.timeEnd('sort pcm')

    this.updateView()
  }

  updateView () {
    if (browser) {
      for (var f = 0, lf = this.features.length; f < lf; f++) {
        this.features[f].updateColumn()
      }
    }
  }

  /**
   * Add a new product create from data and return it
   * @param {Object} data - An object that match product scheme
   * @param {boolean} isFromDB - Is the product loaded from db (doesn't compute type)
   * @return {Product} the product created
   */
  addProduct (data = null, isFromDB = false) {
    if (data == null) {
      data = {cells: []}
      for (var f = 0, lf = this.features.length; f < lf; f++) {
        data.cells.push({
          featureId: this.features[f].id,
          value: null
        })
      }
    }

    var product = new Product(data, this, isFromDB)
    this.products.push(product)
    this.productsById[product.id] = product

    this.updateView()

    return product
  }

  /**
   * Add a new feature created from data and return it and corresponding cells
   * @param {Object} data - An object that match feature scheme
   * @param {boolean} isFromDB - Is the product loaded from db (doesn't compute type)
   * @return {Object} the feature and cells created
   */
  addFeature (data) {
    var cellsByProductId = {}
    var feature = null

    if (typeof data === 'string') { // data is the name of the feature
      feature = new Feature({name: data}, this, false, false)
      this.features.push(feature)
      this.featuresById[feature.id] = feature

      for (var p = 0, lp = this.products.length; p < lp; p++) {
        var product = this.products[p]
        cellsByProductId[product.id] = product.addCell({
            featureId: feature.id,
            value: null
          })
      }

      feature.computeData()
    } else { // data contains feature and cells
      if (this.featuresById[data.feature.id]) throw new Error('A feature with the id : ' + data.feature.id + ', already exists')

      for (var productId in this.productsById) {
        if (data.cellsByProductId[productId]) {
          cellsByProductId[productId] = this.productsById[productId].addCell(data.cellsByProductId[productId], true)
        } else {
          cellsByProductId[productId] = this.productsById[productId].addCell({
            featureId: data.feature.id,
            value: null
          }, true)
        }
      }
      feature = new Feature(data.feature, this, true)
      this.features.push(feature)
      this.featuresById[feature.id] = feature
    }

    if (this.primaryFeatureId == null) this.primaryFeatureId = feature.id

    return {
      feature: feature,
      cellsByProductId: cellsByProductId
    }
  }

  /**
   * Remove the feature corresponding to featureId
   * @param {String} featrueId - the id of the feature
   */
  removeFeature (featureId) {
    var feature = this.featuresById[featureId]
    if (feature) {
      this.features.splice(this.features.indexOf(feature), 1)
      delete this.featuresById[featureId]
      if (this.primaryFeatureId == feature.id) {
        this.primaryFeatureId = this.features[0]
          ? this.features[0].id
          : null
      }
    } else {
      throw new Error('Feature with id : ' + featureId + ', doesn\'t exists')
    }
  }

  export (toDB = false) {
    var products = []
    for (var p = 0, lp = this.products.length; p < lp; p++) {
      products.push(this.products[p].export())
    }

    var features = []
    for (var f = 0, lf = this.features.length; f < lf; f++) {
      features.push(this.features[f].export())
    }

    var obj = {
      name: this.name,
      featureIdGen: this.featureIdGen,
      productIdGen: this.productIdGen,
      description: this.description,
      license: this.license,
      source: this.source,
      author: this.author,
      primaryFeatureId: this.primaryFeatureId,
      features: features,
      products: products
    }

    if (!toDB) obj._id = this._id // don't export id bc defined by mongodb

    return obj
  }
}

if (!browser) {
  module.exports = PCM
}
