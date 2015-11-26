'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _DataParser2 = require('../DataParser');

var _DataParser3 = _interopRequireDefault(_DataParser2);

var _parser = require('./parser');

var _parser2 = _interopRequireDefault(_parser);

var _adapterMSGAdapter = require('./adapter/MSGAdapter');

var _adapterMSGAdapter2 = _interopRequireDefault(_adapterMSGAdapter);

var _adapterMSGDirectAdapter = require('./adapter/MSGDirectAdapter');

var _adapterMSGDirectAdapter2 = _interopRequireDefault(_adapterMSGDirectAdapter);

var _pbTable = require('./pbTable');

var _pbTable2 = _interopRequireDefault(_pbTable);

var _yfloat = require('yfloat');

var _yfloat2 = _interopRequireDefault(_yfloat);

var adapterMap = {
  //'dyna': MSGAdapter
  'news': new _adapterMSGDirectAdapter2['default']()

};

//// 暂时处理权限token不做yfloat解析
//'token': new (class extends MSGAdapter {
//  parseYFloat(data) {
//    return data;
//  }
//})

var DzhyunDataParser = (function (_DataParser) {
  _inherits(DzhyunDataParser, _DataParser);

  function DzhyunDataParser(service) {
    _classCallCheck(this, DzhyunDataParser);

    _get(Object.getPrototypeOf(DzhyunDataParser.prototype), 'constructor', this).call(this);
    this.service = service;
  }

  _createClass(DzhyunDataParser, [{
    key: 'parse',
    value: function parse(data) {
      var uaResponse = _parser2['default'].parse(data, 'UAResponse');
      data = uaResponse.Data;
      if (uaResponse.Err !== 0) {
        return Promise.reject({
          qid: uaResponse.Qid,
          error: data ? typeof data === 'string' ? data : data.toUTF8 ? data.toUTF8() : data.toString() : 'unknown error'
        });
      } else {
        return Promise.resolve({
          qid: uaResponse.Qid,

          // 待解析数据
          data: this._adapter(_parser2['default'].parse(data, 'MSG'))
        });
      }
    }

    // 根据service进行数据转换
  }, {
    key: '_adapter',
    value: function _adapter(data) {
      var _this = this;

      if (!data) {
        return data;
      }
      var keys = Object.keys(adapterMap);
      var adapter = new _adapterMSGAdapter2['default']();
      keys.some(function (key) {
        if (_this.service.indexOf(key) >= 0) {
          adapter = adapterMap[key];
          return true;
        }
      });
      return adapter.adapt(data);
    }
  }]);

  return DzhyunDataParser;
})(_DataParser3['default']);

exports['default'] = DzhyunDataParser;

DzhyunDataParser.parser = _parser2['default'];
DzhyunDataParser.MSGAdapter = _adapterMSGAdapter2['default'];
DzhyunDataParser.pbTable = _pbTable2['default'];
DzhyunDataParser.yfloat = _yfloat2['default'];

// 将DzhyunDataParser暴露到全局，便于外部使用（之后应该要从datastore中提出成单独模块）
var _global = global || undefined;
_global.DzhyunDataParser = DzhyunDataParser;
module.exports = exports['default'];