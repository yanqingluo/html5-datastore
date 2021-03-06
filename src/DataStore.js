import * as $ from './util';
import DzhyunDataParser from './dzhyun/DzhyunDataParser';
import DzhyunTokenManager from './dzhyun/DzhyunTokenManager';

var connection;
try {
  connection = require('html5-connection');
} catch (err) {
  connection = window.connection;
}

class Request {
  constructor(qid, key, filter, subscribe, queryObject) {
    this._promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    this.qid = qid;
    this.key = key;
    this.filter = filter;
    this.subscribe = subscribe;
    this.callbacks = [];
    this.queryObject = queryObject;
  }

  response(data) {
    this.resolve(data);
    this.callbacks.forEach((callback) => {
      callback(data);
    });
  }

  error(err) {
    var e = new Error(err);
    this.reject(e);
    this.callbacks.forEach((callback) => {
      callback(e);
    });
  }

  then(...args) {
    return this._promise.then(...args);
  }

  catch(...args) {
    return this._promise.catch(...args);
  }
}

export default class DataStore {

  // 生成请求序号，递增序号
  static _generateQid() {
    return DataStore._qid = (DataStore._qid || 0) + 1;
  }

  static _datastores = [];

  /**
   * 取消全部datastore请求
   */
  static cancel() {
    DataStore._datastores.forEach((datastore) => {
      datastore.cancel();
    });
  }

  static _connectionHandler = {
    dataParser: new DzhyunDataParser(),
    open() {
      DataStore._datastores.forEach((datastore) => {
        if (datastore.conn && this === datastore.conn._handler) {
          datastore._open();
        }
      });
    },
    request() {
      DataStore._datastores.forEach((datastore) => {
        if (datastore.conn && this === datastore.conn._handler) {
          datastore._request();
        }
      });
    },
    response(data) {

      // 先将data解析为UAResponse，再根据其中qid找到具体对象处理
      let uaResponse = this.dataParser.parseUAResponse(data);
      let {Qid} = uaResponse;
      if (Qid) {
        DataStore._datastores.forEach((datastore) => {
          if (datastore.requestQueue.hasOwnProperty(Qid)) {
            datastore._response(uaResponse);
          }
        });
      } else {
        console.warn('Qid does not exist.');
      }
    },
    close() {
      DataStore._datastores.forEach((datastore) => {
        if (datastore.conn && this === datastore.conn._handler) {
          datastore._close();
        }
      });
    },
    error() {
      DataStore._datastores.forEach((datastore) => {
        if (datastore.conn && this === datastore.conn._handler) {
          datastore._error();
        }
      });
    }
  };

  constructor(options) {

    options = options || {};

    /**
     * {'auto'|boolean} cache缓存规则，默认auto表示根据请求订阅与否决定是否缓存，订阅的请求数据会被缓存，非订阅则不缓存
     * true，则一定都缓存，每次query一定先从缓存查找
     * false，则一定不缓存，每次query一定请求数据
     * XXX 缓存机制基本上没有使用，默认值改为false
     */
    this.cacheEnable = (typeof options.cacheEnable === 'undefined') ? false : options.cacheEnable;

    /** {String} 连接的服务器地址 */
    this.address = options.address || this.constructor.address;

    /** {String} 请求数据的返回类型 pb|json */
    this.dataType = options.dataType || this.constructor.dataType || 'pb';

    /** {String} 请求的服务url */
    this.serviceUrl = options.serviceUrl;

    /** {String} 请求数据的连接类型 http|ws，不指定的话在请求时根据address定 */
    this.connectionType = options.connectionType;

    /** {boolean} 是否创建独立连接 */
    this.alone = options.alone || false;

    /**
     * {String|Array|Object.<String, String>}
     * 请求的字段，字符串需要‘,’分隔，对象表示需要做字段映射，key是服务提供字段名，value是对应要转换的字段名
     */
    this.fields = options.fields;

    this.dataParser = options.dataParser || new DzhyunDataParser(this.serviceUrl || '');

    /**
     * 其它参数
     * @see <http://dms.gw.com.cn/pages/viewpage.action?pageId=128057536#id-请求格式-APP参数>
     *
     * begin_time
     * end_time
     * start
     * count
     * period
     * prefix
     * split
     * name
     * parameter
     * type
     */
    this.otherParams = options.otherParams;

    /** 请求连接 */
    this.conn = null;

    /** 数据的id属性名称（主键），cache中以查询参数中该属性的值为key存储缓存，默认是查询对象obj */
    this.idProperty = options.idProperty || 'obj';

    ///** pb格式message类型 */
    //  Message: null,
    //
    //  dataAdapter: new MSGAdapter(),

    /** {Object.<String, Array>}*/
    this.cache = {};

    this.requestQueue = {};

    // 云平台访问token（暂时）
    this.token = options.token || this.constructor.token;

    this.tokenManager = options.tokenManager || this.constructor.tokenManager;

    this.pushInterval = options.pushInterval || this.constructor.pushInterval;

    DataStore._datastores.push(this);
  }

  // 创建连接，考虑连接共用
  _connection() {
    if (this.conn === null) {
      var map = DataStore._connMap = DataStore._connMap || {};
      var address = this.address;
      var conn;
      if (this.alone === false) {
        conn = map[address];
      }
      if (!conn) {
        var handler = $.extend({}, DataStore._connectionHandler);
        var options = {deferred: true};
        conn = this.connectionType ?
          connection[this.connectionType](address, options, handler) : connection(address, options, handler);

        if (this.alone === false) {
          map[address] = conn;
        }
      }
      this.conn = conn;

      // 实际连接方式
      this.connectionType = conn._protocol;
    }
  }

  _open() {
  }

  _request() {
  }

  /**
   * 存储数据
   * @param data
   * @private
   */
  _store(data) {
    var objs = Object.keys(data);
    objs.forEach((obj) => {

      var cacheForObj = this.cache[obj];
      var dataForObj = data[obj];

      // 判断数据是数组则追加缓存
      if (dataForObj instanceof Array) {
        cacheForObj = cacheForObj || [];
        cacheForObj.push.apply(cacheForObj, dataForObj);
        this.cache[obj] = cacheForObj;
      } else {
        this.cache[obj] = dataForObj;
      }
    });
  }

  _response({Qid, Err, Data}) {
    let request = this.requestQueue[Qid];
    if (!request) {
    } else if (Err !== 0) {
      request.error(Data ? (typeof Data === 'string') ? Data : Data.toUTF8 ? Data.toUTF8() : JSON.stringify(Data) : 'unknown error');
      if (request.subscribe !== true) {
        delete this.requestQueue[Qid];
      }
    } else {
      let data = this.dataParser.parseMsg(Data);

      if (this.cacheEnable) {
        this._store(data);
      }

      var resultData = data;
      if (request.filter) {
        resultData = this._filter(data, request.filter);
      }
      request.response(resultData);

      if (request.subscribe !== true) {
        delete this.requestQueue[Qid];
      } else if (this.connectionType === 'http') {

        var nextRequest = () => {

          // 对于http方式订阅则定时再次查询
          setTimeout(function() {

            // 暂停请求则不做下一次的请求，同时定时下次判断
            if (DataStore.pause === true) {
              nextRequest();
            } else if (request.start) {
              request.start();
            }
          }, this.pushInterval);
        };
        nextRequest();
      }
    }
  }

  _close() {

    // 连接关闭时，调用当前请求的错误回调方法，并且将请求全部取消
    var requestQueue = this.requestQueue;
    var keys = Object.keys(requestQueue);
    keys.forEach((qid) => {
      var request = requestQueue[qid];
      request.error('connection close');
    });

    this.conn = null;
    this.cancel();
  }

  _error() {

    // 连接请求错误时，调用当前请求的错误回调方法
    var requestQueue = this.requestQueue;
    var keys = Object.keys(requestQueue);
    keys.forEach((qid) => {
      var request = requestQueue[qid];
      request.error('request error');
    });
  }

  /**
   * 从缓存中查询指定obj的数据，filter做数据筛选
   * @param {?string} obj
   * @param {function|string|Object} filter
   * @return {boolean.<false>|Object} 返回false表示未找到指定obj的缓存数据，否则应该返回经过filter筛选过的数据
   * @private
   */
  _queryCache(obj, filter) {

    if (this.cacheEnable === false) {
      return false;
    }
    var data;

    // 如果obj存在则根据obj找出cache中的待选数据
    if (obj) {
      var data = this.cache[obj];
      if (!data) {
        return false;
      }
      return this._filter(data, filter);
    } else {
      // 否则obj不存在则从全部的cache中做筛选
      return this._filter(this.cache, filter);
    }
  }

  /**
   * 使用指定的筛选器筛选data中数据，返回筛选结果
   * @param {Object|Array} data
   * @param {function|string|Object}filter
   * @returns {*}
   * @private
   */
  _filter(data, filter) {

    var d = !(data instanceof Array) ? [data] : data;
    if (typeof filter === 'function') {
      return d.filter(filter);
    } else if (typeof filter === 'string') {
      return JSONSelect.match(filter, d);
    } else if (typeof filter === 'object') {
      var selector = [];
      var keys = Object.keys(filter);
      keys.forEach(function(key) {
        var value = filter[key];
        selector.push(':has(.'+key+':expr(x'+value+'))');
      });
      selector = selector.join('');
      return d.filter(function(eachData) {
        return JSONSelect.match(selector, eachData).length > 0;
      });
    }
    return data;
  }

  _requestParams(qid, obj, subscribe) {
    var params = {
      qid: qid,
      sub: (subscribe && this.connectionType === 'ws') ? 1 : 0,
      output: this.dataType
    };

    var fieldStr = this._requestFieldStr();
    fieldStr ? params.field = fieldStr : null;

    return $.param($.extend(params, obj, this.otherParams));
  }

  _requestFieldStr() {
    if (!this.fields) {
      return null;
    } else if (this.fields instanceof Array) {
      return this.fields.join(',');
    } else if (typeof this.fields === 'object') {
      return Object.keys(this.fields).join(',');
    } else {
      return this.fields;
    }
  }

  /**
   * 查询数据
   * @param {Object|string} queryObject 查询对象
   * @param {Object} options 查询参数
   *  obj: {string|Array} 查询对象，obj key值对应着idProperty中指定的属性值
   *    string，是以逗号分割的多个obj
   *  filter: {?function|string|Object} 数据筛选条件，注意设置了filter情况，返回的每一个obj的数据肯定是数组
   *    function，对于每一条数据调用该function，返回true和false表示是否选中
   *    string，使用JSONSelect对于数据进行筛选 @see <http://jsonselect.org/>
   *      example: ':has(:root > .Open:expr(x>=100)):has(.Last:expr(x=100))'
   *    Object，筛选条件的数据对象,使用的也是JSONSelect的:expr，具体查看@see <http://jsonselect.org/#docs/>
   *      example:
   *      {
   *        Open: '>=100',
   *        Last: '=100'
   *        ...
   *      }
   *  subscribe: {?boolean} 是否订阅，默认false
   *  partial: {?boolean} 订阅请求时，返回是增量数据还是全量数据，默认true返回增量数据，(非订阅请求返回都是全量)
   *
   *  @return {Promise}
   */
  query(queryObject, options, cb) {

    var o = options || {},
      filter = o.filter;

    // 如果queryObject不存在则从缓存中筛选数据
    if (!queryObject) {

      // filter存在则是从cache中过滤所有数据
      if (filter) {
        return Promise.resolve(this._queryCache(null, filter));
      } else {
        return Promise.reject(new Error('query object is null'));
      }
    }

    let serviceUrl = this.serviceUrl;

    // 如果查询对象是字符串则反序列化为对象
    if (typeof queryObject === 'string') {
      if (queryObject[0] === '/') {
        [serviceUrl, queryObject] = queryObject.split('?');
      }
      queryObject = $.unParam(queryObject || '');
    }

    var key = queryObject[this.idProperty],
      subscribe = o.subscribe || false,
      forceRequest = o.request,
      partial = o.partial !== false;

    if (key instanceof Array) {
      queryObject[this.idProperty] = key.join(',');
    }

    if (!!key && forceRequest !== true) {

      var request;

      // 判断查询对象是否已请求，已请求过则直接返回请求对象
      var keys = Object.keys(this.requestQueue);
      if (keys.some((qid) => {
        var r = this.requestQueue[qid];
        if (r.key && r.key.toString() === key.toString()) {
          cb && r.callbacks.push(cb);
          request = r;
          return true;
        }
      })) {
        return request;
      }

      // 不是订阅则尝试从缓存中找到数据方法
      if (subscribe !== true && this.cacheEnable !== false) {
        var obj = key;
        if (typeof obj === 'string') {
          obj = obj.split(',').map(function(eachObj) {
            return eachObj.trim();
          });
        }
        var result = [];
        if (obj.every((eachObj) => {
          var data = this._queryCache(eachObj, filter);
          if (data !== false) {
            result[eachObj] = data;
            return true;
          } else {
            return false;
          }
        }) === true) {
          return Promise.resolve(result);
        }
      }
    }

    // 连接
    this._connection();

    var options;

    if (this.connectionType === 'http') {

      // http协议不支持订阅
      //subscribe = false;
      if (this.dataType === 'pb') {

        // 如果以http协议请求pb格式数据时，需设置额外参数以指定响应数据是二进制数据
        options = {
          dataType: 'arraybuffer'
        }
      }
    }
    var qid = DataStore._generateQid();
    var params = this._requestParams(qid, queryObject, subscribe);

    var request = new Request(qid, key, filter, subscribe, queryObject);
    this.requestQueue[qid] = request;
    cb && request.callbacks.push(cb);

    // 附加token处理
    Promise.resolve(this.token || (this.tokenManager && this.tokenManager.getToken())).then((token) => {
      if (token) {

        // 如果ws方式则修改conn的地址添加上token
        if (this.connectionType === 'ws' && this.conn._address.indexOf('token=') < 0) {
          this.conn._address = this.conn._address + '?token=' + token;
        } else if (this.connectionType === 'http') {
          params = params + '&token=' + token;
        }
      }
    }).catch(data => {
      console.warn('Request token fail');
    }).then(() => {

      // 无论token处理成功或者失败，都尝试请求服务
      // 设置start为了http轮询处理
      request.start = () => {

        // 避免请求取消后再次查询，需检查request是否存在
        if (this.requestQueue[request.qid] === request) {
          this.conn.request(serviceUrl + '?' + params, options);
        }
      };
      request.start();
    });
    return request;

    //// 否则通过连接请求数据
    //var qid = this._generateQid();
    //var params = this._requestParams(qid, obj, subscribe);
    //var request = this.conn.request(this.serviceUrl, params, options).always(DataStore._response);
    //
    //// 封装request
    //request = _wrapperRequest(request, {
    //  qid: qid,
    //  obj: obj,
    //  deferreds: [deferred],
    //  subscribe: subscribe,
    //  dataStore: this
    //});
    //
    //this.requestQueue[qid] = request;
    //
    //return deferred;
  }

  request(queryObject, options) {
    return this.query(queryObject, $.extend(options, {
      subscribe: false,
      request: true
    }));
  }

  subscribe(queryObject, options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    } else {
      options = options || {};
    }
    return this.query(queryObject, $.extend(options, {
      subscribe: true
    }), cb);
  }

  _cancelRequest(qid) {
    if (this.connectionType === 'ws' && this.conn && this.conn.getStatus() === WebSocket.OPEN) {
       this.conn.request('/cancel?' + $.param({
        qid: qid
      }));
    }
  }

  /**
   * 取消查询
   * @param number|string qid|obj
   */
  cancel(arg) {
    if (typeof arg === 'number') {
      var qid = arg;
      this._cancelRequest(qid);
      delete this.requestQueue[qid];
    } else {
      var requestQueue = this.requestQueue;
      var keys = Object.keys(requestQueue);
      keys.forEach((qid) => {
        var request = requestQueue[qid];
        if (!arg || request.key === arg) {
          this._cancelRequest(qid);
          delete requestQueue[qid];
        }
      });
    }
  }

  /**
   * 重置store
   */
  reset(options) {

    // 取消当前请求，
    this.cancel();

    // 带入新的设置项
    $.extend(this, options);

    // 清理之前的缓存以及设置
    this.cache = {};

    this.requestQueue = {};

    this.conn = null;
  }
}

DataStore.address = null;
DataStore.datatype = 'pb';
DataStore.pushInterval = 5000;

// 全局暂停标识，对于http订阅数据有效，默认为false
DataStore.pause = false;