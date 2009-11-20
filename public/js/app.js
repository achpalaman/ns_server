if (!('console' in window))
  window.console = {log: function () {}};

/**
*
*  Base64 encode / decode
*  http://www.webtoolkit.info/
*
**/
// ALK Note: we might want to rewrite this.
// webtoolkit.info license doesn't permit removal of comments which js minifiers do.
// also utf8 handling functions are not really utf8, but CESU-8.
// I.e. it doesn't handle utf16 surrogate pairs at all
var Base64 = {
 
	// private property
	_keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
 
	// public method for encoding
	encode : function (input) {
		var output = "";
		var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
		var i = 0;
 
		input = Base64._utf8_encode(input);
 
		while (i < input.length) {
 
			chr1 = input.charCodeAt(i++);
			chr2 = input.charCodeAt(i++);
			chr3 = input.charCodeAt(i++);
 
			enc1 = chr1 >> 2;
			enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
			enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
			enc4 = chr3 & 63;
 
			if (isNaN(chr2)) {
				enc3 = enc4 = 64;
			} else if (isNaN(chr3)) {
				enc4 = 64;
			}
 
			output = output +
			this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
			this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
 
		}
 
		return output;
	},
 
	// public method for decoding
	decode : function (input) {
		var output = "";
		var chr1, chr2, chr3;
		var enc1, enc2, enc3, enc4;
		var i = 0;
 
		input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
 
		while (i < input.length) {
 
			enc1 = this._keyStr.indexOf(input.charAt(i++));
			enc2 = this._keyStr.indexOf(input.charAt(i++));
			enc3 = this._keyStr.indexOf(input.charAt(i++));
			enc4 = this._keyStr.indexOf(input.charAt(i++));
 
			chr1 = (enc1 << 2) | (enc2 >> 4);
			chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
			chr3 = ((enc3 & 3) << 6) | enc4;
 
			output = output + String.fromCharCode(chr1);
 
			if (enc3 != 64) {
				output = output + String.fromCharCode(chr2);
			}
			if (enc4 != 64) {
				output = output + String.fromCharCode(chr3);
			}
 
		}
 
		output = Base64._utf8_decode(output);
 
		return output;
 
	},
 
	// private method for UTF-8 encoding
	_utf8_encode : function (string) {
//		string = string.replace(/\r\n/g,"\n");
		var utftext = "";
 
		for (var n = 0; n < string.length; n++) {
 
			var c = string.charCodeAt(n);
 
			if (c < 128) {
				utftext += String.fromCharCode(c);
			}
			else if((c > 127) && (c < 2048)) {
				utftext += String.fromCharCode((c >> 6) | 192);
				utftext += String.fromCharCode((c & 63) | 128);
			}
			else {
				utftext += String.fromCharCode((c >> 12) | 224);
				utftext += String.fromCharCode(((c >> 6) & 63) | 128);
				utftext += String.fromCharCode((c & 63) | 128);
			}
 
		}
 
		return utftext;
	},
 
	// private method for UTF-8 decoding
	_utf8_decode : function (utftext) {
		var string = "";
		var i = 0;
		var c = c1 = c2 = 0;
 
		while ( i < utftext.length ) {
 
			c = utftext.charCodeAt(i);
 
			if (c < 128) {
				string += String.fromCharCode(c);
				i++;
			}
			else if((c > 191) && (c < 224)) {
				c2 = utftext.charCodeAt(i+1);
				string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
				i += 2;
			}
			else {
				c2 = utftext.charCodeAt(i+1);
				c3 = utftext.charCodeAt(i+2);
				string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
				i += 3;
			}
 
		}
 
		return string;
	}
 
}

function formatUptime(seconds, precision) {
  precision = precision || 8;

  var arr = [[86400, "days", "day"],
             [3600, "hours", "hour"],
             [60, "minutes", "minute"],
             [1, "seconds", "second"]];

  var rv = [];

  $.each(arr, function () {
    var period = this[0];
    var value = (seconds / period) >> 0;
    seconds -= value * period;
    if (value)
      rv.push(String(value) + ' ' + (value > 1 ? this[1] : this[2]));
    return !!--precision;
  });

  return rv.join(', ');
}

// Based on: http://ejohn.org/blog/javascript-micro-templating/
// Simple JavaScript Templating
// John Resig - http://ejohn.org/ - MIT Licensed
;(function(){
  var cache = {};

  this.tmpl = function tmpl(str, data){
    // Figure out if we're getting a template, or if we need to
    // load the template - and be sure to cache the result.

    var fn = !/\W/.test(str) && (cache[str] = cache[str] ||
                                 tmpl(document.getElementById(str).innerHTML));

    if (!fn) {
      var body = "var p=[],print=function(){p.push.apply(p,arguments);}," +
        "h=function(){return String(arguments[0]).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')};" +

      // Introduce the data as local variables using with(){}
      "with(obj){p.push('" +

      // Convert the template into pure JavaScript
      str
      .replace(/[\r\t\n]/g, " ")
      .split("{%").join("\t")
      .replace(/((^|%})[^\t]*)'/g, "$1\r") //'
      .replace(/\t=(.*?)%}/g, "',$1,'")
      .split("\t").join("');")
      .split("%}").join("p.push('")
      .split("\r").join("\\'")
        + "');}return p.join('');"

      // Generate a reusable function that will serve as a template
      // generator (and which will be cached).
      fn = new Function("obj", body);
    }

    // Provide some basic currying to the user
    return data ? fn( data ) : fn;
  };
})();

var StatGraphs = {
  update: function (stats) {
    var main = $('#overview_main_graph span')
    var ops = $('#overview_graph_ops')
    var gets = $('#overview_graph_gets')
    var sets = $('#overview_graph_sets')
    var misses = $('#overview_graph_misses')

    main.sparkline(stats.ops, {width: $(main.get(0).parentNode).innerWidth(), height: 200})
    ops.sparkline(stats.ops, {width: ops.innerWidth(), height: 100})
    gets.sparkline(stats.gets, {width: gets.innerWidth(), height: 100})
    sets.sparkline(stats.sets, {width: sets.innerWidth(), height: 100})
    misses.sparkline(stats.misses, {width: misses.innerWidth(), height: 100})
  }
}

function addBasicAuth(xhr, login, password) {
  var auth = 'Basic ' + Base64.encode(login + ':' + password);
  xhr.setRequestHeader('Authorization', auth);
}

$.ajaxSetup({
  error: function () {
    alert("FIXME: network or server-side error happened! We'll handle it better in the future.");
  },
  beforeSend: function (xhr) {
    if (DAO.login) {
      addBasicAuth(xhr, DAO.login, DAO.password);
    }
  }
});

function deferringUntilReady(body) {
  return function () {
    if (DAO.ready) {
      body.apply(this, arguments);
      return;
    }
    var self = this;
    var args = arguments;
    DAO.onReady(function () {
      body.apply(self, args);
    });
  }
}

$.isString = function (s) {
  return typeof(s) == "string" || (s instanceof String);
}

function prepareAreaUpdate(jq) {
  if ($.isString(jq))
    jq = $(jq);
  var height = jq.height();
  var width = jq.width();
  if (height < 50)
    height = 50;
  if (width < 100)
    width = 100;
  var replacement = $("<div class='spinner'><span>Loading...</span></div>", document);
  replacement.css('width', width + 'px').css('height', height + 'px').css('lineHeight', height + 'px');
  jq.html("");
  jq.append(replacement);
}

function prepareRenderTemplate() {
  $.each($.makeArray(arguments), function () {
    prepareAreaUpdate('#'+ this + '_container');
  });
}

function renderTemplate(key, data) {
  var to = key + '_container';
  var from = key + '_template';
  if ($.isArray(data)) {
    data = {rows:data};
  }
  to = $('#' + to);
  to.get(0).innerHTML = tmpl(from, data);
}

function __topEval() {
  return eval("(" + String(arguments[0]) + ")");
}

function $m(self, method, klass) {
  if (klass) {
    var f = klass.prototype[method];
    if (!f)
      throw new Error("Bogus method: " + method + " on prototype of: " + klass);
    return function () {
      return f.apply(self, arguments);
    }
  } else {
    var f = self[method];
    if (!f)
      throw new Error("Bogus method: " + method + " on object: " + self);
    return function () {
      return f.apply(self, arguments);
    }
  }
}

function mkClass(methods) {
  if (_.isFunction(methods)) {
    var superclass = methods;
    var origMethods = arguments[1];

    var meta = new Function();
    meta.prototype = superclass.prototype;

    methods = _.extend(new meta, origMethods);
  }

  var constructor = __topEval(function () {
    if (this.initialize)
      return this.initialize.apply(this, arguments);
  });

  constructor.prototype = methods;
  return constructor;
}

var Slave = mkClass({
  initialize: function (thunk) {
    this.thunk = thunk
  },
  die: function () {this.dead = true;},
  nMoreTimes: function (times) {
    this.times = this.times || 0;
    this.times += times;
    var oldThunk = this.thunk;
    this.thunk = function (data) {
      oldThunk.call(this, data);
      if (--this.times == 0)
        this.die();
    }
    return this;
  }
});

var CallbackSlot = mkClass({
  initialize: function () {
    this.slaves = [];
  },
  subscribeWithSlave: function (thunk) {
    var slave = new Slave(thunk);
    this.slaves.push(slave);
    return slave;
  },
  subscribeOnce: function (thunk) {
    return this.subscribeWithSlave(thunk).nMoreTimes(1);
  },
  broadcast: function (data) {
    var oldSlaves = this.slaves;
    var newSlaves = this.slaves = [];
    $.each(oldSlaves, function (index, slave) {
      slave.thunk(data);
      if (!slave.dead)
        newSlaves.push(slave);
    });
  },
  unsubscribe: function (slave) {
    slave.die();
    var index = $.inArray(slave, this.slaves);
    if (index >= 0)
      this.slaves.splice(index, 1);
  }
});

// inspired in part by http://common-lisp.net/project/cells/
var Cell = mkClass({
  initialize: function (formula, sources) {
    this.changedSlot = new CallbackSlot();
    this.undefinedSlot = new CallbackSlot();
    this.formula = formula;
    this.value = undefined;
    this.sources = [];
    if (sources)
      this.setSources(sources);
  },
  sourceChanged: function (source) {
    _.defer($m(this, 'tryUpdatingValue'));
  },
  sourceUndefined: function (source) {
    var self = this;
    _.defer(function () {
      self.setValue(undefined);
    });
  },
  setSources: function (context) {
    var self = this;
    if (this.sources.length != 0)
      throw new Error('cannot adjust sources yet');
    if (!this.formula)
      throw new Error("formula-less cells cannot have sources");
    var slots = this.sources = _.values(context);
    this.context = _.extend({self: this}, context);
    

    _.each(slots, function (slot) {
      slot.changedSlot.subscribeWithSlave($m(self, 'sourceChanged'))
      slot.undefinedSlot.subscribeWithSlave($m(self, 'sourceUndefined'));
    });

    this.tryUpdatingValue();

    return this;
  },
  setValue: function (newValue) {
    var oldValue = this.value;
    this.value = newValue;

    if (newValue === undefined) {
      if (oldValue !== undefined)
        this.undefinedSlot.broadcast(this);
      return;
    }

    if (oldValue != newValue)
      this.changedSlot.broadcast(this);
  },
  tryUpdatingValue: function () {
    var context = {};
    _.each(this.context, function (cell, key) {
      context[key] = (key == 'self') ? cell : cell.value;
    });
    var value = this.formula.call(context);
    this.setValue(value);
  }
});

var UpdatesChannel = mkClass({
  initialize: function (updateInitiator, period, plugged) {
    this.updateInitiator = updateInitiator;
    this.slot = new CallbackSlot();
    this.plugged = plugged ? 1 : 0;
    this.setPeriod(period);
  },
  setPeriod: function (period) {
    if (this.intervalHandle)
      cancelInterval(this.intervalHandle);
    this.period = period;
    setInterval($m(this, 'tickHandler'), this.period*1000);
    if (!this.updateIsInProgress)
      this.initiateUpdate();
  },
  tickHandler: function () {
    if (this.plugged)
      return;
    if (this.updateIsInProgress) {
      this.hadTickOverflow = true;
      return;
    }
    this.initiateUpdate();
  },
  updateSuccess: function (flag, data) {
    if (flag.cancelled)
      return;
    this.recentData = data;
    try {
      if (!this.plugged)
        this.slot.broadcast(this);
    } finally {
      this.updateComplete();
    }
  },
  updateComplete: function () {
    this.updateIsInProgress = false;
    if (this.hadTickOverflow) {
      this.hadTickOverflow = false;
      this.initiateUpdate();
    }
  },
  updateError: function (flag) {
    if (flag.cancelled)
      return;
    this.updateComplete();
  },
  initiateUpdate: function () {
    if (this.plugged)
      return;
    this.updateIsInProgress = {};
    this.updateInitiator(_.bind(this.updateSuccess, this, this.updateIsInProgress),
                         _.bind(this.updateError, this, this.updateIsInProgress));
  },
  plug: function (cancelCurrentUpdate) {
    if (cancelCurrentUpdate && this.updateIsInProgress) {
      this.updateIsInProgress.cancelled = true;
      this.hadTickOverflow = false;
      this.updateIsInProgress = false;
    }
    if (this.plugged++ != 0)
      return;
    if (this.intervalHandle)
      cancelInterval(this.intervalHandle);
  },
  unplug: function () {
    if (--this.plugged != 0)
      return;
    this.setPeriod(this.period);
  }
});

var CellControlledUpdateChannel = mkClass(UpdatesChannel, {
  initialize: function (cell, period) {
    var _super = $m(this, 'initialize', UpdatesChannel);
    _super($m(this, 'updateInitiator'), period, true);
    this.cell = cell;
    this.cell.changedSlot.subscribeWithSlave($m(this, 'onCellChanged'));
    this.cell.undefinedSlot.subscribeWithSlave($m(this, 'onCellUndefined'));
    this.pluggedViaCell = true;
  },
  onCellChanged: function () {
    if (!this.pluggedViaCell)
        this.plug(true);
    this.pluggedViaCell = false;
    this.unplug();
  },
  onCellUndefined: function () {
    this.pluggedViaCell = true;
    this.plug(true);
  },
  updateInitiator: function (okCallback, errorCallback) {
    $.ajax(_.extend({type: 'GET',
                     dataType: 'json',
                     success: okCallback,
                     error: errorCallback},
                    this.cell.value));
  }
});

var DAO = {
  ready: false,
  onReady: function (thunk) {
    if (DAO.ready)
      thunk.call(null);
    else
      $(window).one('dao:ready', function () {thunk();});
  },
  switchSection: function (section) {
    DAO.cells.mode.setValue(section);
  },
  performLogin: function (login, password) {
    this.login = login;
    this.password = password;
    $.get('/pools', null, function (data) {
      DAO.ready = true;
      $(window).trigger('dao:ready');
      DAO.cells.poolList.setValue(data);
    }, 'json');
  }
};

// TODO: need special ajax valued cell type so that we can avoid DoS-ing
// server with duplicate requests
function asyncAjaxCellValue(cell, options) {
  $.ajax(_.extend({type: 'GET',
                   dataType: 'json',
                   success: function (data) {
                     cell.setValue(data);
                   }},
                 options));
}

(function () {
  var modeCell = new Cell();
  var poolListCell = new Cell();
  // holds current pool description from pool list
  var currentPoolCell = new Cell(function () {
    return this.poolList && this.poolList[0];
  }).setSources({poolList: poolListCell});

  // pool details as obtained by retrieving pool uri
  var currentPoolDetails = new Cell(function () {
    if (!this.currentPool || this.mode != 'overview')
      return;
    asyncAjaxCellValue(this.self, {url: this.currentPool.uri});
  }).setSources({currentPool: currentPoolCell, mode: modeCell});

  // holds uri of current bucket
  var currentBucketCell = new Cell(function () {
    return this.pool && this.pool.defaultBucketURI;
  }).setSources({pool: currentPoolCell});

  var currentBucketDetailsCell = new Cell(function () {
    if (!this.bucketURI || this.mode != 'overview')
      return;
    asyncAjaxCellValue(this.self, {url: this.bucketURI});
  }).setSources({bucketURI: currentBucketCell, mode: modeCell});

  var opStatsArgsCell = new Cell(function () {
    if (!this.bucket)
      return;
    return {url: this.bucket.op_stats_uri};
  }).setSources({bucket: currentBucketDetailsCell});
  var opStatsChannel = new CellControlledUpdateChannel(opStatsArgsCell, 10);

  var keyStatsArgsCell = new Cell(function () {
    if (!this.bucket)
      return;
    return {url: this.bucket.key_stats_uri};
  }).setSources({bucket: currentBucketDetailsCell});
  var keyStatsChannel = new CellControlledUpdateChannel(keyStatsArgsCell, 10);

  DAO.cells = {
    mode: modeCell,
    poolList: poolListCell,
    currentPool: currentPoolCell,
    currentPoolDetails: currentPoolDetails,
    currentBucket: currentBucketCell,
    currentBucketDetails: currentBucketDetailsCell
  }
  DAO.channels = {
    opStats: opStatsChannel,
    keyStats: keyStatsChannel
  }
})();

function prepareTemplateForCell(templateName, cell) {
  cell.undefinedSlot.subscribeWithSlave(_.bind(prepareRenderTemplate, null, templateName));
}

var OverviewSection = {
  updatePoolList: function (data) {
    renderTemplate('pool_list', data);
  },
  clearUI: function () {
    prepareRenderTemplate('top_keys', 'server_list', 'pool_list');
  },
  onFreshStats: function (channel) {
    StatGraphs.update(channel.recentData);
  },
  onKeyStats: function (channel) {
    renderTemplate('top_keys', $.map(channel.recentData, function (e) {
      return $.extend({}, e, {total: 0 + e.gets + e.misses});
    }));
  },
  onFreshNodeList: function () {
    var nodes = DAO.cells.currentPoolDetails.value.node;
    renderTemplate('server_list', nodes);
  },
  init: function () {
    DAO.channels.opStats.slot.subscribeWithSlave($m(this, 'onFreshStats'));
    DAO.channels.keyStats.slot.subscribeWithSlave($m(this, 'onKeyStats'));
    DAO.cells.currentPoolDetails.changedSlot.subscribeWithSlave($m(this, 'onFreshNodeList'));
    prepareTemplateForCell('top_keys', DAO.cells.currentBucketDetails);
    prepareTemplateForCell('pool_list', DAO.cells.poolList);
    prepareTemplateForCell('server_list', DAO.cells.currentPoolDetails);
  },
  onEnter: function () {
  }
};

var DummySection = {
  onEnter: function () {}
};

var ThePage = {
  sections: {overview: OverviewSection,
             alerts: DummySection,
             settings: DummySection},
  currentSection: null,
  currentSectionName: null,
  gotoSection: function (section) {
    if (!(this.sections[section])) {
      throw new Error('unknown section:' + section);
    }
    $.bbq.pushState({sec: section});
  },
  initialize: function () {
    OverviewSection.init();
    var self = this;
    DAO.onReady(function () {
      $(window).bind('hashchange', function () {
        var sec = $.bbq.getState('sec') || 'overview';
        if (sec == self.currentSectionName)
          return;
        var oldSection = self.currentSection;
        var currentSection = self.sections[sec];
        if (!currentSection) {
          self.gotoSection('overview');
          return;
        }
        self.currentSectionName = sec;
        self.currentSection = currentSection;

        DAO.switchSection(sec);

        $('#middle_pane > div').css('display', 'none');
        $('#'+sec).css('display','block');
        setTimeout(function () {
          if (oldSection && oldSection.onLeave)
            oldSection.onLeave();
          self.currentSection.onEnter();
          $(window).trigger('sec:' + sec);
        }, 10);
      });
    });
  }
};

function loginFormSubmit() {
  var login = $('#login_form [name=login]').val();
  var password = $('#login_form [name=password]').val();
  DAO.performLogin(login, password);
  $(window).one('dao:ready', function () {
    $('#login_dialog').jqmHide();
  });
  return false;
}

window.nav = {
  go: $m(ThePage, 'gotoSection')
};

$(function () {
  $('#login_dialog').jqm({modal: true}).jqmShow();
  setTimeout(function () {
    $('#login_dialog [name=login]').get(0).focus();
  }, 100);

  ThePage.initialize();

  DAO.onReady(function () {
    $(window).trigger('hashchange');
  });

  $('#server_list_container .expander').live('click', function (e) {
    var container = $('#server_list_container');

    var mydetails = $(e.target).parents("#server_list_container .primary").next();
    var opened = mydetails.hasClass('opened');

    container.find(".details").removeClass('opened');
    mydetails.toggleClass('opened', !opened);
  });
});
