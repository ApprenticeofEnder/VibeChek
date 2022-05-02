var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function select_option(select, value) {
        for (let i = 0; i < select.options.length; i += 1) {
            const option = select.options[i];
            if (option.__value === value) {
                option.selected = true;
                return;
            }
        }
        select.selectedIndex = -1; // no option should be selected
    }
    function select_value(select) {
        const selected_option = select.querySelector(':checked') || select.options[0];
        return selected_option && selected_option.__value;
    }
    function custom_event(type, detail, bubbles = false) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    var page = {exports: {}};

    (function (module, exports) {
    (function (global, factory) {
    	module.exports = factory() ;
    }(commonjsGlobal, (function () {
    var isarray = Array.isArray || function (arr) {
      return Object.prototype.toString.call(arr) == '[object Array]';
    };

    /**
     * Expose `pathToRegexp`.
     */
    var pathToRegexp_1 = pathToRegexp;
    var parse_1 = parse;
    var compile_1 = compile;
    var tokensToFunction_1 = tokensToFunction;
    var tokensToRegExp_1 = tokensToRegExp;

    /**
     * The main path matching regexp utility.
     *
     * @type {RegExp}
     */
    var PATH_REGEXP = new RegExp([
      // Match escaped characters that would otherwise appear in future matches.
      // This allows the user to escape special characters that won't transform.
      '(\\\\.)',
      // Match Express-style parameters and un-named parameters with a prefix
      // and optional suffixes. Matches appear as:
      //
      // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?", undefined]
      // "/route(\\d+)"  => [undefined, undefined, undefined, "\d+", undefined, undefined]
      // "/*"            => ["/", undefined, undefined, undefined, undefined, "*"]
      '([\\/.])?(?:(?:\\:(\\w+)(?:\\(((?:\\\\.|[^()])+)\\))?|\\(((?:\\\\.|[^()])+)\\))([+*?])?|(\\*))'
    ].join('|'), 'g');

    /**
     * Parse a string for the raw tokens.
     *
     * @param  {String} str
     * @return {Array}
     */
    function parse (str) {
      var tokens = [];
      var key = 0;
      var index = 0;
      var path = '';
      var res;

      while ((res = PATH_REGEXP.exec(str)) != null) {
        var m = res[0];
        var escaped = res[1];
        var offset = res.index;
        path += str.slice(index, offset);
        index = offset + m.length;

        // Ignore already escaped sequences.
        if (escaped) {
          path += escaped[1];
          continue
        }

        // Push the current path onto the tokens.
        if (path) {
          tokens.push(path);
          path = '';
        }

        var prefix = res[2];
        var name = res[3];
        var capture = res[4];
        var group = res[5];
        var suffix = res[6];
        var asterisk = res[7];

        var repeat = suffix === '+' || suffix === '*';
        var optional = suffix === '?' || suffix === '*';
        var delimiter = prefix || '/';
        var pattern = capture || group || (asterisk ? '.*' : '[^' + delimiter + ']+?');

        tokens.push({
          name: name || key++,
          prefix: prefix || '',
          delimiter: delimiter,
          optional: optional,
          repeat: repeat,
          pattern: escapeGroup(pattern)
        });
      }

      // Match any characters still remaining.
      if (index < str.length) {
        path += str.substr(index);
      }

      // If the path exists, push it onto the end.
      if (path) {
        tokens.push(path);
      }

      return tokens
    }

    /**
     * Compile a string to a template function for the path.
     *
     * @param  {String}   str
     * @return {Function}
     */
    function compile (str) {
      return tokensToFunction(parse(str))
    }

    /**
     * Expose a method for transforming tokens into the path function.
     */
    function tokensToFunction (tokens) {
      // Compile all the tokens into regexps.
      var matches = new Array(tokens.length);

      // Compile all the patterns before compilation.
      for (var i = 0; i < tokens.length; i++) {
        if (typeof tokens[i] === 'object') {
          matches[i] = new RegExp('^' + tokens[i].pattern + '$');
        }
      }

      return function (obj) {
        var path = '';
        var data = obj || {};

        for (var i = 0; i < tokens.length; i++) {
          var token = tokens[i];

          if (typeof token === 'string') {
            path += token;

            continue
          }

          var value = data[token.name];
          var segment;

          if (value == null) {
            if (token.optional) {
              continue
            } else {
              throw new TypeError('Expected "' + token.name + '" to be defined')
            }
          }

          if (isarray(value)) {
            if (!token.repeat) {
              throw new TypeError('Expected "' + token.name + '" to not repeat, but received "' + value + '"')
            }

            if (value.length === 0) {
              if (token.optional) {
                continue
              } else {
                throw new TypeError('Expected "' + token.name + '" to not be empty')
              }
            }

            for (var j = 0; j < value.length; j++) {
              segment = encodeURIComponent(value[j]);

              if (!matches[i].test(segment)) {
                throw new TypeError('Expected all "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
              }

              path += (j === 0 ? token.prefix : token.delimiter) + segment;
            }

            continue
          }

          segment = encodeURIComponent(value);

          if (!matches[i].test(segment)) {
            throw new TypeError('Expected "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
          }

          path += token.prefix + segment;
        }

        return path
      }
    }

    /**
     * Escape a regular expression string.
     *
     * @param  {String} str
     * @return {String}
     */
    function escapeString (str) {
      return str.replace(/([.+*?=^!:${}()[\]|\/])/g, '\\$1')
    }

    /**
     * Escape the capturing group by escaping special characters and meaning.
     *
     * @param  {String} group
     * @return {String}
     */
    function escapeGroup (group) {
      return group.replace(/([=!:$\/()])/g, '\\$1')
    }

    /**
     * Attach the keys as a property of the regexp.
     *
     * @param  {RegExp} re
     * @param  {Array}  keys
     * @return {RegExp}
     */
    function attachKeys (re, keys) {
      re.keys = keys;
      return re
    }

    /**
     * Get the flags for a regexp from the options.
     *
     * @param  {Object} options
     * @return {String}
     */
    function flags (options) {
      return options.sensitive ? '' : 'i'
    }

    /**
     * Pull out keys from a regexp.
     *
     * @param  {RegExp} path
     * @param  {Array}  keys
     * @return {RegExp}
     */
    function regexpToRegexp (path, keys) {
      // Use a negative lookahead to match only capturing groups.
      var groups = path.source.match(/\((?!\?)/g);

      if (groups) {
        for (var i = 0; i < groups.length; i++) {
          keys.push({
            name: i,
            prefix: null,
            delimiter: null,
            optional: false,
            repeat: false,
            pattern: null
          });
        }
      }

      return attachKeys(path, keys)
    }

    /**
     * Transform an array into a regexp.
     *
     * @param  {Array}  path
     * @param  {Array}  keys
     * @param  {Object} options
     * @return {RegExp}
     */
    function arrayToRegexp (path, keys, options) {
      var parts = [];

      for (var i = 0; i < path.length; i++) {
        parts.push(pathToRegexp(path[i], keys, options).source);
      }

      var regexp = new RegExp('(?:' + parts.join('|') + ')', flags(options));

      return attachKeys(regexp, keys)
    }

    /**
     * Create a path regexp from string input.
     *
     * @param  {String} path
     * @param  {Array}  keys
     * @param  {Object} options
     * @return {RegExp}
     */
    function stringToRegexp (path, keys, options) {
      var tokens = parse(path);
      var re = tokensToRegExp(tokens, options);

      // Attach keys back to the regexp.
      for (var i = 0; i < tokens.length; i++) {
        if (typeof tokens[i] !== 'string') {
          keys.push(tokens[i]);
        }
      }

      return attachKeys(re, keys)
    }

    /**
     * Expose a function for taking tokens and returning a RegExp.
     *
     * @param  {Array}  tokens
     * @param  {Array}  keys
     * @param  {Object} options
     * @return {RegExp}
     */
    function tokensToRegExp (tokens, options) {
      options = options || {};

      var strict = options.strict;
      var end = options.end !== false;
      var route = '';
      var lastToken = tokens[tokens.length - 1];
      var endsWithSlash = typeof lastToken === 'string' && /\/$/.test(lastToken);

      // Iterate over the tokens and create our regexp string.
      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];

        if (typeof token === 'string') {
          route += escapeString(token);
        } else {
          var prefix = escapeString(token.prefix);
          var capture = token.pattern;

          if (token.repeat) {
            capture += '(?:' + prefix + capture + ')*';
          }

          if (token.optional) {
            if (prefix) {
              capture = '(?:' + prefix + '(' + capture + '))?';
            } else {
              capture = '(' + capture + ')?';
            }
          } else {
            capture = prefix + '(' + capture + ')';
          }

          route += capture;
        }
      }

      // In non-strict mode we allow a slash at the end of match. If the path to
      // match already ends with a slash, we remove it for consistency. The slash
      // is valid at the end of a path match, not in the middle. This is important
      // in non-ending mode, where "/test/" shouldn't match "/test//route".
      if (!strict) {
        route = (endsWithSlash ? route.slice(0, -2) : route) + '(?:\\/(?=$))?';
      }

      if (end) {
        route += '$';
      } else {
        // In non-ending mode, we need the capturing groups to match as much as
        // possible by using a positive lookahead to the end or next path segment.
        route += strict && endsWithSlash ? '' : '(?=\\/|$)';
      }

      return new RegExp('^' + route, flags(options))
    }

    /**
     * Normalize the given path string, returning a regular expression.
     *
     * An empty array can be passed in for the keys, which will hold the
     * placeholder key descriptions. For example, using `/user/:id`, `keys` will
     * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
     *
     * @param  {(String|RegExp|Array)} path
     * @param  {Array}                 [keys]
     * @param  {Object}                [options]
     * @return {RegExp}
     */
    function pathToRegexp (path, keys, options) {
      keys = keys || [];

      if (!isarray(keys)) {
        options = keys;
        keys = [];
      } else if (!options) {
        options = {};
      }

      if (path instanceof RegExp) {
        return regexpToRegexp(path, keys)
      }

      if (isarray(path)) {
        return arrayToRegexp(path, keys, options)
      }

      return stringToRegexp(path, keys, options)
    }

    pathToRegexp_1.parse = parse_1;
    pathToRegexp_1.compile = compile_1;
    pathToRegexp_1.tokensToFunction = tokensToFunction_1;
    pathToRegexp_1.tokensToRegExp = tokensToRegExp_1;

    /**
       * Module dependencies.
       */

      

      /**
       * Short-cuts for global-object checks
       */

      var hasDocument = ('undefined' !== typeof document);
      var hasWindow = ('undefined' !== typeof window);
      var hasHistory = ('undefined' !== typeof history);
      var hasProcess = typeof process !== 'undefined';

      /**
       * Detect click event
       */
      var clickEvent = hasDocument && document.ontouchstart ? 'touchstart' : 'click';

      /**
       * To work properly with the URL
       * history.location generated polyfill in https://github.com/devote/HTML5-History-API
       */

      var isLocation = hasWindow && !!(window.history.location || window.location);

      /**
       * The page instance
       * @api private
       */
      function Page() {
        // public things
        this.callbacks = [];
        this.exits = [];
        this.current = '';
        this.len = 0;

        // private things
        this._decodeURLComponents = true;
        this._base = '';
        this._strict = false;
        this._running = false;
        this._hashbang = false;

        // bound functions
        this.clickHandler = this.clickHandler.bind(this);
        this._onpopstate = this._onpopstate.bind(this);
      }

      /**
       * Configure the instance of page. This can be called multiple times.
       *
       * @param {Object} options
       * @api public
       */

      Page.prototype.configure = function(options) {
        var opts = options || {};

        this._window = opts.window || (hasWindow && window);
        this._decodeURLComponents = opts.decodeURLComponents !== false;
        this._popstate = opts.popstate !== false && hasWindow;
        this._click = opts.click !== false && hasDocument;
        this._hashbang = !!opts.hashbang;

        var _window = this._window;
        if(this._popstate) {
          _window.addEventListener('popstate', this._onpopstate, false);
        } else if(hasWindow) {
          _window.removeEventListener('popstate', this._onpopstate, false);
        }

        if (this._click) {
          _window.document.addEventListener(clickEvent, this.clickHandler, false);
        } else if(hasDocument) {
          _window.document.removeEventListener(clickEvent, this.clickHandler, false);
        }

        if(this._hashbang && hasWindow && !hasHistory) {
          _window.addEventListener('hashchange', this._onpopstate, false);
        } else if(hasWindow) {
          _window.removeEventListener('hashchange', this._onpopstate, false);
        }
      };

      /**
       * Get or set basepath to `path`.
       *
       * @param {string} path
       * @api public
       */

      Page.prototype.base = function(path) {
        if (0 === arguments.length) return this._base;
        this._base = path;
      };

      /**
       * Gets the `base`, which depends on whether we are using History or
       * hashbang routing.

       * @api private
       */
      Page.prototype._getBase = function() {
        var base = this._base;
        if(!!base) return base;
        var loc = hasWindow && this._window && this._window.location;

        if(hasWindow && this._hashbang && loc && loc.protocol === 'file:') {
          base = loc.pathname;
        }

        return base;
      };

      /**
       * Get or set strict path matching to `enable`
       *
       * @param {boolean} enable
       * @api public
       */

      Page.prototype.strict = function(enable) {
        if (0 === arguments.length) return this._strict;
        this._strict = enable;
      };


      /**
       * Bind with the given `options`.
       *
       * Options:
       *
       *    - `click` bind to click events [true]
       *    - `popstate` bind to popstate [true]
       *    - `dispatch` perform initial dispatch [true]
       *
       * @param {Object} options
       * @api public
       */

      Page.prototype.start = function(options) {
        var opts = options || {};
        this.configure(opts);

        if (false === opts.dispatch) return;
        this._running = true;

        var url;
        if(isLocation) {
          var window = this._window;
          var loc = window.location;

          if(this._hashbang && ~loc.hash.indexOf('#!')) {
            url = loc.hash.substr(2) + loc.search;
          } else if (this._hashbang) {
            url = loc.search + loc.hash;
          } else {
            url = loc.pathname + loc.search + loc.hash;
          }
        }

        this.replace(url, null, true, opts.dispatch);
      };

      /**
       * Unbind click and popstate event handlers.
       *
       * @api public
       */

      Page.prototype.stop = function() {
        if (!this._running) return;
        this.current = '';
        this.len = 0;
        this._running = false;

        var window = this._window;
        this._click && window.document.removeEventListener(clickEvent, this.clickHandler, false);
        hasWindow && window.removeEventListener('popstate', this._onpopstate, false);
        hasWindow && window.removeEventListener('hashchange', this._onpopstate, false);
      };

      /**
       * Show `path` with optional `state` object.
       *
       * @param {string} path
       * @param {Object=} state
       * @param {boolean=} dispatch
       * @param {boolean=} push
       * @return {!Context}
       * @api public
       */

      Page.prototype.show = function(path, state, dispatch, push) {
        var ctx = new Context(path, state, this),
          prev = this.prevContext;
        this.prevContext = ctx;
        this.current = ctx.path;
        if (false !== dispatch) this.dispatch(ctx, prev);
        if (false !== ctx.handled && false !== push) ctx.pushState();
        return ctx;
      };

      /**
       * Goes back in the history
       * Back should always let the current route push state and then go back.
       *
       * @param {string} path - fallback path to go back if no more history exists, if undefined defaults to page.base
       * @param {Object=} state
       * @api public
       */

      Page.prototype.back = function(path, state) {
        var page = this;
        if (this.len > 0) {
          var window = this._window;
          // this may need more testing to see if all browsers
          // wait for the next tick to go back in history
          hasHistory && window.history.back();
          this.len--;
        } else if (path) {
          setTimeout(function() {
            page.show(path, state);
          });
        } else {
          setTimeout(function() {
            page.show(page._getBase(), state);
          });
        }
      };

      /**
       * Register route to redirect from one path to other
       * or just redirect to another route
       *
       * @param {string} from - if param 'to' is undefined redirects to 'from'
       * @param {string=} to
       * @api public
       */
      Page.prototype.redirect = function(from, to) {
        var inst = this;

        // Define route from a path to another
        if ('string' === typeof from && 'string' === typeof to) {
          page.call(this, from, function(e) {
            setTimeout(function() {
              inst.replace(/** @type {!string} */ (to));
            }, 0);
          });
        }

        // Wait for the push state and replace it with another
        if ('string' === typeof from && 'undefined' === typeof to) {
          setTimeout(function() {
            inst.replace(from);
          }, 0);
        }
      };

      /**
       * Replace `path` with optional `state` object.
       *
       * @param {string} path
       * @param {Object=} state
       * @param {boolean=} init
       * @param {boolean=} dispatch
       * @return {!Context}
       * @api public
       */


      Page.prototype.replace = function(path, state, init, dispatch) {
        var ctx = new Context(path, state, this),
          prev = this.prevContext;
        this.prevContext = ctx;
        this.current = ctx.path;
        ctx.init = init;
        ctx.save(); // save before dispatching, which may redirect
        if (false !== dispatch) this.dispatch(ctx, prev);
        return ctx;
      };

      /**
       * Dispatch the given `ctx`.
       *
       * @param {Context} ctx
       * @api private
       */

      Page.prototype.dispatch = function(ctx, prev) {
        var i = 0, j = 0, page = this;

        function nextExit() {
          var fn = page.exits[j++];
          if (!fn) return nextEnter();
          fn(prev, nextExit);
        }

        function nextEnter() {
          var fn = page.callbacks[i++];

          if (ctx.path !== page.current) {
            ctx.handled = false;
            return;
          }
          if (!fn) return unhandled.call(page, ctx);
          fn(ctx, nextEnter);
        }

        if (prev) {
          nextExit();
        } else {
          nextEnter();
        }
      };

      /**
       * Register an exit route on `path` with
       * callback `fn()`, which will be called
       * on the previous context when a new
       * page is visited.
       */
      Page.prototype.exit = function(path, fn) {
        if (typeof path === 'function') {
          return this.exit('*', path);
        }

        var route = new Route(path, null, this);
        for (var i = 1; i < arguments.length; ++i) {
          this.exits.push(route.middleware(arguments[i]));
        }
      };

      /**
       * Handle "click" events.
       */

      /* jshint +W054 */
      Page.prototype.clickHandler = function(e) {
        if (1 !== this._which(e)) return;

        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (e.defaultPrevented) return;

        // ensure link
        // use shadow dom when available if not, fall back to composedPath()
        // for browsers that only have shady
        var el = e.target;
        var eventPath = e.path || (e.composedPath ? e.composedPath() : null);

        if(eventPath) {
          for (var i = 0; i < eventPath.length; i++) {
            if (!eventPath[i].nodeName) continue;
            if (eventPath[i].nodeName.toUpperCase() !== 'A') continue;
            if (!eventPath[i].href) continue;

            el = eventPath[i];
            break;
          }
        }

        // continue ensure link
        // el.nodeName for svg links are 'a' instead of 'A'
        while (el && 'A' !== el.nodeName.toUpperCase()) el = el.parentNode;
        if (!el || 'A' !== el.nodeName.toUpperCase()) return;

        // check if link is inside an svg
        // in this case, both href and target are always inside an object
        var svg = (typeof el.href === 'object') && el.href.constructor.name === 'SVGAnimatedString';

        // Ignore if tag has
        // 1. "download" attribute
        // 2. rel="external" attribute
        if (el.hasAttribute('download') || el.getAttribute('rel') === 'external') return;

        // ensure non-hash for the same path
        var link = el.getAttribute('href');
        if(!this._hashbang && this._samePath(el) && (el.hash || '#' === link)) return;

        // Check for mailto: in the href
        if (link && link.indexOf('mailto:') > -1) return;

        // check target
        // svg target is an object and its desired value is in .baseVal property
        if (svg ? el.target.baseVal : el.target) return;

        // x-origin
        // note: svg links that are not relative don't call click events (and skip page.js)
        // consequently, all svg links tested inside page.js are relative and in the same origin
        if (!svg && !this.sameOrigin(el.href)) return;

        // rebuild path
        // There aren't .pathname and .search properties in svg links, so we use href
        // Also, svg href is an object and its desired value is in .baseVal property
        var path = svg ? el.href.baseVal : (el.pathname + el.search + (el.hash || ''));

        path = path[0] !== '/' ? '/' + path : path;

        // strip leading "/[drive letter]:" on NW.js on Windows
        if (hasProcess && path.match(/^\/[a-zA-Z]:\//)) {
          path = path.replace(/^\/[a-zA-Z]:\//, '/');
        }

        // same page
        var orig = path;
        var pageBase = this._getBase();

        if (path.indexOf(pageBase) === 0) {
          path = path.substr(pageBase.length);
        }

        if (this._hashbang) path = path.replace('#!', '');

        if (pageBase && orig === path && (!isLocation || this._window.location.protocol !== 'file:')) {
          return;
        }

        e.preventDefault();
        this.show(orig);
      };

      /**
       * Handle "populate" events.
       * @api private
       */

      Page.prototype._onpopstate = (function () {
        var loaded = false;
        if ( ! hasWindow ) {
          return function () {};
        }
        if (hasDocument && document.readyState === 'complete') {
          loaded = true;
        } else {
          window.addEventListener('load', function() {
            setTimeout(function() {
              loaded = true;
            }, 0);
          });
        }
        return function onpopstate(e) {
          if (!loaded) return;
          var page = this;
          if (e.state) {
            var path = e.state.path;
            page.replace(path, e.state);
          } else if (isLocation) {
            var loc = page._window.location;
            page.show(loc.pathname + loc.search + loc.hash, undefined, undefined, false);
          }
        };
      })();

      /**
       * Event button.
       */
      Page.prototype._which = function(e) {
        e = e || (hasWindow && this._window.event);
        return null == e.which ? e.button : e.which;
      };

      /**
       * Convert to a URL object
       * @api private
       */
      Page.prototype._toURL = function(href) {
        var window = this._window;
        if(typeof URL === 'function' && isLocation) {
          return new URL(href, window.location.toString());
        } else if (hasDocument) {
          var anc = window.document.createElement('a');
          anc.href = href;
          return anc;
        }
      };

      /**
       * Check if `href` is the same origin.
       * @param {string} href
       * @api public
       */
      Page.prototype.sameOrigin = function(href) {
        if(!href || !isLocation) return false;

        var url = this._toURL(href);
        var window = this._window;

        var loc = window.location;

        /*
           When the port is the default http port 80 for http, or 443 for
           https, internet explorer 11 returns an empty string for loc.port,
           so we need to compare loc.port with an empty string if url.port
           is the default port 80 or 443.
           Also the comparition with `port` is changed from `===` to `==` because
           `port` can be a string sometimes. This only applies to ie11.
        */
        return loc.protocol === url.protocol &&
          loc.hostname === url.hostname &&
          (loc.port === url.port || loc.port === '' && (url.port == 80 || url.port == 443)); // jshint ignore:line
      };

      /**
       * @api private
       */
      Page.prototype._samePath = function(url) {
        if(!isLocation) return false;
        var window = this._window;
        var loc = window.location;
        return url.pathname === loc.pathname &&
          url.search === loc.search;
      };

      /**
       * Remove URL encoding from the given `str`.
       * Accommodates whitespace in both x-www-form-urlencoded
       * and regular percent-encoded form.
       *
       * @param {string} val - URL component to decode
       * @api private
       */
      Page.prototype._decodeURLEncodedURIComponent = function(val) {
        if (typeof val !== 'string') { return val; }
        return this._decodeURLComponents ? decodeURIComponent(val.replace(/\+/g, ' ')) : val;
      };

      /**
       * Create a new `page` instance and function
       */
      function createPage() {
        var pageInstance = new Page();

        function pageFn(/* args */) {
          return page.apply(pageInstance, arguments);
        }

        // Copy all of the things over. In 2.0 maybe we use setPrototypeOf
        pageFn.callbacks = pageInstance.callbacks;
        pageFn.exits = pageInstance.exits;
        pageFn.base = pageInstance.base.bind(pageInstance);
        pageFn.strict = pageInstance.strict.bind(pageInstance);
        pageFn.start = pageInstance.start.bind(pageInstance);
        pageFn.stop = pageInstance.stop.bind(pageInstance);
        pageFn.show = pageInstance.show.bind(pageInstance);
        pageFn.back = pageInstance.back.bind(pageInstance);
        pageFn.redirect = pageInstance.redirect.bind(pageInstance);
        pageFn.replace = pageInstance.replace.bind(pageInstance);
        pageFn.dispatch = pageInstance.dispatch.bind(pageInstance);
        pageFn.exit = pageInstance.exit.bind(pageInstance);
        pageFn.configure = pageInstance.configure.bind(pageInstance);
        pageFn.sameOrigin = pageInstance.sameOrigin.bind(pageInstance);
        pageFn.clickHandler = pageInstance.clickHandler.bind(pageInstance);

        pageFn.create = createPage;

        Object.defineProperty(pageFn, 'len', {
          get: function(){
            return pageInstance.len;
          },
          set: function(val) {
            pageInstance.len = val;
          }
        });

        Object.defineProperty(pageFn, 'current', {
          get: function(){
            return pageInstance.current;
          },
          set: function(val) {
            pageInstance.current = val;
          }
        });

        // In 2.0 these can be named exports
        pageFn.Context = Context;
        pageFn.Route = Route;

        return pageFn;
      }

      /**
       * Register `path` with callback `fn()`,
       * or route `path`, or redirection,
       * or `page.start()`.
       *
       *   page(fn);
       *   page('*', fn);
       *   page('/user/:id', load, user);
       *   page('/user/' + user.id, { some: 'thing' });
       *   page('/user/' + user.id);
       *   page('/from', '/to')
       *   page();
       *
       * @param {string|!Function|!Object} path
       * @param {Function=} fn
       * @api public
       */

      function page(path, fn) {
        // <callback>
        if ('function' === typeof path) {
          return page.call(this, '*', path);
        }

        // route <path> to <callback ...>
        if ('function' === typeof fn) {
          var route = new Route(/** @type {string} */ (path), null, this);
          for (var i = 1; i < arguments.length; ++i) {
            this.callbacks.push(route.middleware(arguments[i]));
          }
          // show <path> with [state]
        } else if ('string' === typeof path) {
          this['string' === typeof fn ? 'redirect' : 'show'](path, fn);
          // start [options]
        } else {
          this.start(path);
        }
      }

      /**
       * Unhandled `ctx`. When it's not the initial
       * popstate then redirect. If you wish to handle
       * 404s on your own use `page('*', callback)`.
       *
       * @param {Context} ctx
       * @api private
       */
      function unhandled(ctx) {
        if (ctx.handled) return;
        var current;
        var page = this;
        var window = page._window;

        if (page._hashbang) {
          current = isLocation && this._getBase() + window.location.hash.replace('#!', '');
        } else {
          current = isLocation && window.location.pathname + window.location.search;
        }

        if (current === ctx.canonicalPath) return;
        page.stop();
        ctx.handled = false;
        isLocation && (window.location.href = ctx.canonicalPath);
      }

      /**
       * Escapes RegExp characters in the given string.
       *
       * @param {string} s
       * @api private
       */
      function escapeRegExp(s) {
        return s.replace(/([.+*?=^!:${}()[\]|/\\])/g, '\\$1');
      }

      /**
       * Initialize a new "request" `Context`
       * with the given `path` and optional initial `state`.
       *
       * @constructor
       * @param {string} path
       * @param {Object=} state
       * @api public
       */

      function Context(path, state, pageInstance) {
        var _page = this.page = pageInstance || page;
        var window = _page._window;
        var hashbang = _page._hashbang;

        var pageBase = _page._getBase();
        if ('/' === path[0] && 0 !== path.indexOf(pageBase)) path = pageBase + (hashbang ? '#!' : '') + path;
        var i = path.indexOf('?');

        this.canonicalPath = path;
        var re = new RegExp('^' + escapeRegExp(pageBase));
        this.path = path.replace(re, '') || '/';
        if (hashbang) this.path = this.path.replace('#!', '') || '/';

        this.title = (hasDocument && window.document.title);
        this.state = state || {};
        this.state.path = path;
        this.querystring = ~i ? _page._decodeURLEncodedURIComponent(path.slice(i + 1)) : '';
        this.pathname = _page._decodeURLEncodedURIComponent(~i ? path.slice(0, i) : path);
        this.params = {};

        // fragment
        this.hash = '';
        if (!hashbang) {
          if (!~this.path.indexOf('#')) return;
          var parts = this.path.split('#');
          this.path = this.pathname = parts[0];
          this.hash = _page._decodeURLEncodedURIComponent(parts[1]) || '';
          this.querystring = this.querystring.split('#')[0];
        }
      }

      /**
       * Push state.
       *
       * @api private
       */

      Context.prototype.pushState = function() {
        var page = this.page;
        var window = page._window;
        var hashbang = page._hashbang;

        page.len++;
        if (hasHistory) {
            window.history.pushState(this.state, this.title,
              hashbang && this.path !== '/' ? '#!' + this.path : this.canonicalPath);
        }
      };

      /**
       * Save the context state.
       *
       * @api public
       */

      Context.prototype.save = function() {
        var page = this.page;
        if (hasHistory) {
            page._window.history.replaceState(this.state, this.title,
              page._hashbang && this.path !== '/' ? '#!' + this.path : this.canonicalPath);
        }
      };

      /**
       * Initialize `Route` with the given HTTP `path`,
       * and an array of `callbacks` and `options`.
       *
       * Options:
       *
       *   - `sensitive`    enable case-sensitive routes
       *   - `strict`       enable strict matching for trailing slashes
       *
       * @constructor
       * @param {string} path
       * @param {Object=} options
       * @api private
       */

      function Route(path, options, page) {
        var _page = this.page = page || globalPage;
        var opts = options || {};
        opts.strict = opts.strict || _page._strict;
        this.path = (path === '*') ? '(.*)' : path;
        this.method = 'GET';
        this.regexp = pathToRegexp_1(this.path, this.keys = [], opts);
      }

      /**
       * Return route middleware with
       * the given callback `fn()`.
       *
       * @param {Function} fn
       * @return {Function}
       * @api public
       */

      Route.prototype.middleware = function(fn) {
        var self = this;
        return function(ctx, next) {
          if (self.match(ctx.path, ctx.params)) {
            ctx.routePath = self.path;
            return fn(ctx, next);
          }
          next();
        };
      };

      /**
       * Check if this route matches `path`, if so
       * populate `params`.
       *
       * @param {string} path
       * @param {Object} params
       * @return {boolean}
       * @api private
       */

      Route.prototype.match = function(path, params) {
        var keys = this.keys,
          qsIndex = path.indexOf('?'),
          pathname = ~qsIndex ? path.slice(0, qsIndex) : path,
          m = this.regexp.exec(decodeURIComponent(pathname));

        if (!m) return false;

        delete params[0];

        for (var i = 1, len = m.length; i < len; ++i) {
          var key = keys[i - 1];
          var val = this.page._decodeURLEncodedURIComponent(m[i]);
          if (val !== undefined || !(hasOwnProperty.call(params, key.name))) {
            params[key.name] = val;
          }
        }

        return true;
      };


      /**
       * Module exports.
       */

      var globalPage = createPage();
      var page_js = globalPage;
      var default_1 = globalPage;

    page_js.default = default_1;

    return page_js;

    })));
    }(page));

    var router = page.exports;

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const loginErrors = writable([]);

    const registrationErrors = writable([]);

    const storedUserId = localStorage.getItem("userId");
    const userId = writable(storedUserId);
    userId.subscribe(value => {
        localStorage.setItem("userId", value ? value : null);
    });

    const storedCreatorMode = localStorage.getItem("creatorMode");
    const creatorMode = writable(storedCreatorMode);
    creatorMode.subscribe(value => {
        localStorage.setItem("creatorMode", value ? value : "playlist_search");
    });

    /* src/views/components/common/SchedulePlayer.svelte generated by Svelte v3.46.4 */

    function create_else_block$7(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Private");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (45:8) {#if isPublic}
    function create_if_block$a(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Public");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$h(ctx) {
    	let div;
    	let h3;
    	let t0;
    	let t1;
    	let h6;
    	let t2;
    	let t3;
    	let button;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*isPublic*/ ctx[1]) return create_if_block$a;
    		return create_else_block$7;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			div = element("div");
    			h3 = element("h3");
    			t0 = text(/*name*/ ctx[0]);
    			t1 = space();
    			h6 = element("h6");
    			if_block.c();
    			t2 = text(" schedule");
    			t3 = space();
    			button = element("button");
    			button.innerHTML = `<i class="fa-solid fa-play"></i>`;
    			attr(button, "class", "btn btn-success btn-circle btn-sm svelte-15p8yx3");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, h3);
    			append(h3, t0);
    			append(div, t1);
    			append(div, h6);
    			if_block.m(h6, null);
    			append(h6, t2);
    			append(div, t3);
    			append(div, button);

    			if (!mounted) {
    				dispose = listen(button, "click", /*play*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*name*/ 1) set_data(t0, /*name*/ ctx[0]);

    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(h6, t2);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$h($$self, $$props, $$invalidate) {
    	let { data } = $$props;
    	let name, scheduleId, isPublic;
    	const dispatch = createEventDispatcher();

    	onMount(() => {
    		$$invalidate(0, name = data.name);
    		scheduleId = data.schedule_id;
    		$$invalidate(1, isPublic = data.is_public);
    	});

    	function play() {
    		fetch("/api/vibechek/player", {
    			method: "POST",
    			credentials: "include",
    			headers: { "Content-Type": "application/json" },
    			body: JSON.stringify({ schedule: scheduleId })
    		}).then(response => {
    			if (response.status === 403) {
    				alert("You don't have Spotify Premium, so unfortunately we can't do this. Seriously. It's their decision, not ours. Gah.");
    				throw response;
    			} else {
    				return response.json();
    			}
    		}).then(data => {
    			dispatch('playing', data);
    		}).catch(err => {
    			
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('data' in $$props) $$invalidate(3, data = $$props.data);
    	};

    	return [name, isPublic, play, data];
    }

    class SchedulePlayer extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$h, create_fragment$h, safe_not_equal, { data: 3 });
    	}
    }

    /* src/views/components/common/ButtonLink.svelte generated by Svelte v3.46.4 */

    function create_fragment$g(ctx) {
    	let a;
    	let t;

    	return {
    		c() {
    			a = element("a");
    			t = text(/*text*/ ctx[1]);
    			attr(a, "href", /*link*/ ctx[0]);
    			attr(a, "class", "btn btn-primary");
    		},
    		m(target, anchor) {
    			insert(target, a, anchor);
    			append(a, t);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*text*/ 2) set_data(t, /*text*/ ctx[1]);

    			if (dirty & /*link*/ 1) {
    				attr(a, "href", /*link*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(a);
    		}
    	};
    }

    function instance$g($$self, $$props, $$invalidate) {
    	let { link } = $$props;
    	let { text } = $$props;

    	$$self.$$set = $$props => {
    		if ('link' in $$props) $$invalidate(0, link = $$props.link);
    		if ('text' in $$props) $$invalidate(1, text = $$props.text);
    	};

    	return [link, text];
    }

    class ButtonLink extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$g, create_fragment$g, safe_not_equal, { link: 0, text: 1 });
    	}
    }

    /* src/views/Player.svelte generated by Svelte v3.46.4 */

    function get_each_context$8(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[10] = list[i];
    	return child_ctx;
    }

    // (99:19) 
    function create_if_block_2$6(ctx) {
    	let h2;

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Vibe Day Finished";
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(h2);
    		}
    	};
    }

    // (96:0) {#if block_name}
    function create_if_block_1$7(ctx) {
    	let h2;
    	let t0;
    	let t1;
    	let t2;
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = text("Now Playing: ");
    			t1 = text(/*block_name*/ ctx[1]);
    			t2 = space();
    			button = element("button");
    			button.textContent = "Stop";
    			attr(button, "class", "btn btn-alert");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			append(h2, t0);
    			append(h2, t1);
    			insert(target, t2, anchor);
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*playerStop*/ ctx[4]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*block_name*/ 2) set_data(t1, /*block_name*/ ctx[1]);
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t2);
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (107:0) {:else}
    function create_else_block$6(ctx) {
    	let h1;

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "No schedules detected. Make some!";
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(h1);
    		}
    	};
    }

    // (103:0) {#if schedules.length}
    function create_if_block$9(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*schedules*/ ctx[2];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$8(get_each_context$8(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*schedules, playerStart*/ 12) {
    				each_value = /*schedules*/ ctx[2];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$8(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$8(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (104:4) {#each schedules as schedule}
    function create_each_block$8(ctx) {
    	let scheduleplayer;
    	let current;
    	scheduleplayer = new SchedulePlayer({ props: { data: /*schedule*/ ctx[10] } });
    	scheduleplayer.$on("playing", /*playerStart*/ ctx[3]);

    	return {
    		c() {
    			create_component(scheduleplayer.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(scheduleplayer, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const scheduleplayer_changes = {};
    			if (dirty & /*schedules*/ 4) scheduleplayer_changes.data = /*schedule*/ ctx[10];
    			scheduleplayer.$set(scheduleplayer_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(scheduleplayer.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(scheduleplayer.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(scheduleplayer, detaching);
    		}
    	};
    }

    function create_fragment$f(ctx) {
    	let h1;
    	let t1;
    	let t2;
    	let current_block_type_index;
    	let if_block1;
    	let t3;
    	let buttonlink;
    	let current;

    	function select_block_type(ctx, dirty) {
    		if (/*block_name*/ ctx[1]) return create_if_block_1$7;
    		if (/*finished*/ ctx[0]) return create_if_block_2$6;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type && current_block_type(ctx);
    	const if_block_creators = [create_if_block$9, create_else_block$6];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*schedules*/ ctx[2].length) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	buttonlink = new ButtonLink({
    			props: {
    				text: "Create New Schedule",
    				link: "/creator"
    			}
    		});

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Vibechek Player";
    			t1 = space();
    			if (if_block0) if_block0.c();
    			t2 = space();
    			if_block1.c();
    			t3 = space();
    			create_component(buttonlink.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t2, anchor);
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, t3, anchor);
    			mount_component(buttonlink, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if (if_block0) if_block0.d(1);
    				if_block0 = current_block_type && current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(t2.parentNode, t2);
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block1 = if_blocks[current_block_type_index];

    				if (!if_block1) {
    					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block1.c();
    				} else {
    					if_block1.p(ctx, dirty);
    				}

    				transition_in(if_block1, 1);
    				if_block1.m(t3.parentNode, t3);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block1);
    			transition_in(buttonlink.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block1);
    			transition_out(buttonlink.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);

    			if (if_block0) {
    				if_block0.d(detaching);
    			}

    			if (detaching) detach(t2);
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(t3);
    			destroy_component(buttonlink, detaching);
    		}
    	};
    }

    function instance$f($$self, $$props, $$invalidate) {
    	let $userId;
    	component_subscribe($$self, userId, $$value => $$invalidate(7, $userId = $$value));
    	let schedules = [];
    	let finished = false;
    	let update = false;
    	let time = null;
    	let block_name = null;

    	function init() {
    		fetch(`/api/vibechek/users/${$userId}/schedules`).then(response => response.json()).then(data => {
    			$$invalidate(2, schedules = data.schedules);
    		}).catch(err => {
    			
    		});
    	}

    	function playerStart(event) {
    		$$invalidate(6, time = event.detail.time);
    		$$invalidate(1, block_name = event.detail.block_name);

    		if (time === null) {
    			$$invalidate(0, finished = true);
    			return;
    		}

    		$$invalidate(0, finished = false);
    		$$invalidate(5, update = true);
    	}

    	function playerUpdate(time, block_name) {
    		setTimeout(
    			() => {
    				fetch("/api/vibechek/player").then(response => {
    					if (response.status === 403) {
    						response.json().then(data => {
    							throw data;
    						}).catch(err => {
    							throw err;
    						});
    					}

    					return response.json();
    				}).then(data => {
    					if (time) {
    						time = data.time;
    						$$invalidate(5, update = true);
    					}
    				}).catch(err => {
    					alert(err.message);
    				});
    			},
    			time * 1000
    		);
    	}

    	function playerStop() {
    		fetch("/api/vibechek/player", {
    			method: "DELETE",
    			credentials: "include",
    			headers: { "Content-Type": "application/json" },
    			body: JSON.stringify({})
    		}).then(response => response.json()).then(data => {
    			$$invalidate(6, time = null);
    			$$invalidate(1, block_name = null);
    			$$invalidate(0, finished = true);
    		}).catch(err => {
    			
    		});
    	}

    	onMount(init);

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*update, finished, time, block_name*/ 99) {
    			if (update) {
    				$$invalidate(5, update = false);

    				if (!finished) {
    					playerUpdate(time);
    				}
    			}
    		}
    	};

    	return [finished, block_name, schedules, playerStart, playerStop, update, time];
    }

    class Player extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$f, create_fragment$f, safe_not_equal, {});
    	}
    }

    function secondsToBlocks(seconds) {
        return seconds / 1800;
    }

    function secondsToHoursAndMinutes(seconds) {
        let minutes = Math.floor(seconds / 60);
        return {
            minutes: minutes % 60,
            hours: Math.floor(minutes / 60)
        };
    }

    function redirectFetch(endpoint, window){
        fetch(endpoint)
            .then(response => response.json())
            .then(data => {
                window.location.href = data.redirectUrl;
            })
            .catch(err => {

            });
    }

    function timePad(data){
        return String(data).padStart(2, '0');
    }

    const timeZones = [
        'Europe/Andorra',
        'Asia/Dubai',
        'Asia/Kabul',
        'Europe/Tirane',
        'Asia/Yerevan',
        'Antarctica/Casey',
        'Antarctica/Davis',
        'Antarctica/DumontDUrville', 
        'Antarctica/Mawson',
        'Antarctica/Palmer',
        'Antarctica/Rothera',
        'Antarctica/Syowa',
        'Antarctica/Troll',
        'Antarctica/Vostok',
        'America/Argentina/Buenos_Aires',
        'America/Argentina/Cordoba',
        'America/Argentina/Salta',
        'America/Argentina/Jujuy',
        'America/Argentina/Tucuman',
        'America/Argentina/Catamarca',
        'America/Argentina/La_Rioja',
        'America/Argentina/San_Juan',
        'America/Argentina/Mendoza',
        'America/Argentina/San_Luis',
        'America/Argentina/Rio_Gallegos',
        'America/Argentina/Ushuaia',
        'Pacific/Pago_Pago',
        'Europe/Vienna',
        'Australia/Lord_Howe',
        'Antarctica/Macquarie',
        'Australia/Hobart',
        'Australia/Currie',
        'Australia/Melbourne',
        'Australia/Sydney',
        'Australia/Broken_Hill',
        'Australia/Brisbane',
        'Australia/Lindeman',
        'Australia/Adelaide',
        'Australia/Darwin',
        'Australia/Perth',
        'Australia/Eucla',
        'Asia/Baku',
        'America/Barbados',
        'Asia/Dhaka',
        'Europe/Brussels',
        'Europe/Sofia',
        'Atlantic/Bermuda',
        'Asia/Brunei',
        'America/La_Paz',
        'America/Noronha',
        'America/Belem',
        'America/Fortaleza',
        'America/Recife',
        'America/Araguaina',
        'America/Maceio',
        'America/Bahia',
        'America/Sao_Paulo',
        'America/Campo_Grande',
        'America/Cuiaba',
        'America/Santarem',
        'America/Porto_Velho',
        'America/Boa_Vista',
        'America/Manaus',
        'America/Eirunepe',
        'America/Rio_Branco',
        'America/Nassau',
        'Asia/Thimphu',
        'Europe/Minsk',
        'America/Belize',
        'America/St_Johns',
        'America/Halifax',
        'America/Glace_Bay',
        'America/Moncton',
        'America/Goose_Bay',
        'America/Blanc-Sablon',
        'America/Toronto',
        'America/Nipigon',
        'America/Thunder_Bay',
        'America/Iqaluit',
        'America/Pangnirtung',
        'America/Atikokan',
        'America/Winnipeg',
        'America/Rainy_River',
        'America/Resolute',
        'America/Rankin_Inlet',
        'America/Regina',
        'America/Swift_Current',
        'America/Edmonton',
        'America/Cambridge_Bay',
        'America/Yellowknife',
        'America/Inuvik',
        'America/Creston',
        'America/Dawson_Creek',
        'America/Fort_Nelson',
        'America/Vancouver',
        'America/Whitehorse',
        'America/Dawson',
        'Indian/Cocos',
        'Europe/Zurich',
        'Africa/Abidjan',
        'Pacific/Rarotonga',
        'America/Santiago',
        'America/Punta_Arenas',
        'Pacific/Easter',
        'Asia/Shanghai',
        'Asia/Urumqi',
        'America/Bogota',
        'America/Costa_Rica',
        'America/Havana',
        'Atlantic/Cape_Verde',
        'America/Curacao',
        'Indian/Christmas',
        'Asia/Nicosia',
        'Asia/Famagusta',
        'Europe/Prague',
        'Europe/Berlin',
        'Europe/Copenhagen',
        'America/Santo_Domingo',
        'Africa/Algiers',
        'America/Guayaquil',
        'Pacific/Galapagos',
        'Europe/Tallinn',
        'Africa/Cairo',
        'Africa/El_Aaiun',
        'Europe/Madrid',
        'Africa/Ceuta',
        'Atlantic/Canary',
        'Europe/Helsinki',
        'Pacific/Fiji',
        'Atlantic/Stanley',
        'Pacific/Chuuk',
        'Pacific/Pohnpei',
        'Pacific/Kosrae',
        'Atlantic/Faroe',
        'Europe/Paris',
        'Europe/London',
        'Asia/Tbilisi',
        'America/Cayenne',
        'Africa/Accra',
        'Europe/Gibraltar',
        'America/Godthab',
        'America/Danmarkshavn',
        'America/Scoresbysund',
        'America/Thule',
        'Europe/Athens',
        'Atlantic/South_Georgia',
        'America/Guatemala',
        'Pacific/Guam',
        'Africa/Bissau',
        'America/Guyana',
        'Asia/Hong_Kong',
        'America/Tegucigalpa',
        'America/Port-au-Prince',
        'Europe/Budapest',
        'Asia/Jakarta',
        'Asia/Pontianak',
        'Asia/Makassar',
        'Asia/Jayapura',
        'Europe/Dublin',
        'Asia/Jerusalem',
        'Asia/Kolkata',
        'Indian/Chagos',
        'Asia/Baghdad',
        'Asia/Tehran',
        'Atlantic/Reykjavik',
        'Europe/Rome',
        'America/Jamaica',
        'Asia/Amman',
        'Asia/Tokyo',
        'Africa/Nairobi',
        'Asia/Bishkek',
        'Pacific/Tarawa',
        'Pacific/Enderbury',
        'Pacific/Kiritimati',
        'Asia/Pyongyang',
        'Asia/Seoul',
        'Asia/Almaty',
        'Asia/Qyzylorda',
        'Asia/Qostanay',
        'Asia/Aqtobe',
        'Asia/Aqtau',
        'Asia/Atyrau',
        'Asia/Oral',
        'Asia/Beirut',
        'Asia/Colombo',
        'Africa/Monrovia',
        'Europe/Vilnius',
        'Europe/Luxembourg',
        'Europe/Riga',
        'Africa/Tripoli',
        'Africa/Casablanca',
        'Europe/Monaco',
        'Europe/Chisinau',
        'Pacific/Majuro',
        'Pacific/Kwajalein',
        'Asia/Yangon',
        'Asia/Ulaanbaatar',
        'Asia/Hovd',
        'Asia/Choibalsan',
        'Asia/Macau',
        'America/Martinique',
        'Europe/Malta',
        'Indian/Mauritius',
        'Indian/Maldives',
        'America/Mexico_City',
        'America/Cancun',
        'America/Merida',
        'America/Monterrey',
        'America/Matamoros',
        'America/Mazatlan',
        'America/Chihuahua',
        'America/Ojinaga',
        'America/Hermosillo',
        'America/Tijuana',
        'America/Bahia_Banderas',
        'Asia/Kuala_Lumpur',
        'Asia/Kuching',
        'Africa/Maputo',
        'Africa/Windhoek',
        'Pacific/Noumea',
        'Pacific/Norfolk',
        'Africa/Lagos',
        'America/Managua',
        'Europe/Amsterdam',
        'Europe/Oslo',
        'Asia/Kathmandu',
        'Pacific/Nauru',
        'Pacific/Niue',
        'Pacific/Auckland',
        'Pacific/Chatham',
        'America/Panama',
        'America/Lima',
        'Pacific/Tahiti',
        'Pacific/Marquesas',
        'Pacific/Gambier',
        'Pacific/Port_Moresby',
        'Pacific/Bougainville',
        'Asia/Manila',
        'Asia/Karachi',
        'Europe/Warsaw',
        'America/Miquelon',
        'Pacific/Pitcairn',
        'America/Puerto_Rico',
        'Asia/Gaza',
        'Asia/Hebron',
        'Europe/Lisbon',
        'Atlantic/Madeira',
        'Atlantic/Azores',
        'Pacific/Palau',
        'America/Asuncion',
        'Asia/Qatar',
        'Indian/Reunion',
        'Europe/Bucharest',
        'Europe/Belgrade',
        'Europe/Kaliningrad',
        'Europe/Moscow',
        'Europe/Simferopol',
        'Europe/Kirov',
        'Europe/Astrakhan',
        'Europe/Volgograd',
        'Europe/Saratov',
        'Europe/Ulyanovsk',
        'Europe/Samara',
        'Asia/Yekaterinburg',
        'Asia/Omsk',
        'Asia/Novosibirsk',
        'Asia/Barnaul',
        'Asia/Tomsk',
        'Asia/Novokuznetsk',
        'Asia/Krasnoyarsk',
        'Asia/Irkutsk',
        'Asia/Chita',
        'Asia/Yakutsk',
        'Asia/Khandyga',
        'Asia/Vladivostok',
        'Asia/Ust-Nera',
        'Asia/Magadan',
        'Asia/Sakhalin',
        'Asia/Srednekolymsk',
        'Asia/Kamchatka',
        'Asia/Anadyr',
        'Asia/Riyadh',
        'Pacific/Guadalcanal',
        'Indian/Mahe',
        'Africa/Khartoum',
        'Europe/Stockholm',
        'Asia/Singapore',
        'America/Paramaribo',
        'Africa/Juba',
        'Africa/Sao_Tome',
        'America/El_Salvador',
        'Asia/Damascus',
        'America/Grand_Turk',
        'Africa/Ndjamena',
        'Indian/Kerguelen',
        'Asia/Bangkok',
        'Asia/Dushanbe',
        'Pacific/Fakaofo',
        'Asia/Dili',
        'Asia/Ashgabat',
        'Africa/Tunis',
        'Pacific/Tongatapu',
        'Europe/Istanbul',
        'America/Port_of_Spain',
        'Pacific/Funafuti',
        'Asia/Taipei',
        'Europe/Kiev',
        'Europe/Uzhgorod',
        'Europe/Zaporozhye',
        'Pacific/Wake',
        'America/New_York',
        'America/Detroit',
        'America/Kentucky/Louisville',
        'America/Kentucky/Monticello',
        'America/Indiana/Indianapolis',
        'America/Indiana/Vincennes',
        'America/Indiana/Winamac',
        'America/Indiana/Marengo',
        'America/Indiana/Petersburg',
        'America/Indiana/Vevay',
        'America/Chicago',
        'America/Indiana/Tell_City',
        'America/Indiana/Knox',
        'America/Menominee',
        'America/North_Dakota/Center',
        'America/North_Dakota/New_Salem',
        'America/North_Dakota/Beulah',
        'America/Denver',
        'America/Boise',
        'America/Phoenix',
        'America/Los_Angeles',
        'America/Anchorage',
        'America/Juneau',
        'America/Sitka',
        'America/Metlakatla',
        'America/Yakutat',
        'America/Nome',
        'America/Adak',
        'Pacific/Honolulu',
        'America/Montevideo',
        'Asia/Samarkand',
        'Asia/Tashkent',
        'America/Caracas',
        'Asia/Ho_Chi_Minh',
        'Pacific/Efate',
        'Pacific/Wallis',
        'Pacific/Apia',
        'Africa/Johannesburg'
    ].sort((a, b)=> {
        if(a < b) { return -1; }
        if(a > b) { return 1; }
        return 0;
    });

    var client = {
        redirectFetch,
        secondsToBlocks,
        secondsToHoursAndMinutes,
        timeZones,
        timePad
    };

    /* src/views/components/Registration.svelte generated by Svelte v3.46.4 */

    function get_each_context$7(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[10] = list[i];
    	return child_ctx;
    }

    function get_each_context_1$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[13] = list[i];
    	return child_ctx;
    }

    // (47:8) {#if $registrationErrors.length}
    function create_if_block_1$6(ctx) {
    	let each_1_anchor;
    	let each_value_1 = /*$registrationErrors*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$3(get_each_context_1$3(ctx, each_value_1, i));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$registrationErrors*/ 2) {
    				each_value_1 = /*$registrationErrors*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$3(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (48:12) {#each $registrationErrors as error}
    function create_each_block_1$3(ctx) {
    	let div;
    	let t0_value = /*error*/ ctx[13] + "";
    	let t0;
    	let t1;

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			attr(div, "class", "alert alert-danger");
    			attr(div, "role", "alert");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$registrationErrors*/ 2 && t0_value !== (t0_value = /*error*/ ctx[13] + "")) set_data(t0, t0_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (62:12) {#if placeholder}
    function create_if_block$8(ctx) {
    	let option;

    	return {
    		c() {
    			option = element("option");
    			option.textContent = `${placeholder$3}`;
    			option.__value = "";
    			option.value = option.__value;
    			option.disabled = true;
    			option.selected = true;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (65:12) {#each timeZones as timezone}
    function create_each_block$7(ctx) {
    	let option;
    	let t_value = /*timezone*/ ctx[10] + "";
    	let t;
    	let option_value_value;

    	return {
    		c() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = option_value_value = /*timezone*/ ctx[10];
    			option.value = option.__value;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    function create_fragment$e(ctx) {
    	let div1;
    	let div0;
    	let h1;
    	let t1;
    	let t2;
    	let label0;
    	let t4;
    	let input0;
    	let t5;
    	let label1;
    	let t7;
    	let input1;
    	let t8;
    	let label2;
    	let t10;
    	let input2;
    	let t11;
    	let label3;
    	let t13;
    	let select;
    	let if_block1_anchor;
    	let t14;
    	let label4;
    	let input3;
    	let t15;
    	let t16;
    	let label5;
    	let input4;
    	let t17;
    	let t18;
    	let button;
    	let mounted;
    	let dispose;
    	let if_block0 = /*$registrationErrors*/ ctx[1].length && create_if_block_1$6(ctx);
    	let if_block1 = create_if_block$8();
    	let each_value = client.timeZones;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$7(get_each_context$7(ctx, each_value, i));
    	}

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Register";
    			t1 = space();
    			if (if_block0) if_block0.c();
    			t2 = space();
    			label0 = element("label");
    			label0.textContent = "Username";
    			t4 = space();
    			input0 = element("input");
    			t5 = space();
    			label1 = element("label");
    			label1.textContent = "Email Address";
    			t7 = space();
    			input1 = element("input");
    			t8 = space();
    			label2 = element("label");
    			label2.textContent = "Password";
    			t10 = space();
    			input2 = element("input");
    			t11 = space();
    			label3 = element("label");
    			label3.textContent = "Timezone";
    			t13 = space();
    			select = element("select");
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t14 = space();
    			label4 = element("label");
    			input3 = element("input");
    			t15 = text("\n            Private Account");
    			t16 = space();
    			label5 = element("label");
    			input4 = element("input");
    			t17 = text("\n            Public Account");
    			t18 = space();
    			button = element("button");
    			button.textContent = "Register";
    			attr(label0, "for", "username");
    			attr(input0, "name", "username");
    			attr(label1, "for", "email");
    			attr(input1, "name", "email");
    			attr(label2, "for", "password");
    			attr(input2, "type", "password");
    			attr(input2, "name", "password");
    			attr(label3, "for", "timezone");
    			attr(select, "name", "timezone");
    			if (/*formData*/ ctx[0].timezone === void 0) add_render_callback(() => /*select_change_handler*/ ctx[6].call(select));
    			attr(input3, "type", "radio");
    			attr(input3, "name", "is_public");
    			input3.__value = 0;
    			input3.value = input3.__value;
    			/*$$binding_groups*/ ctx[8][0].push(input3);
    			attr(input4, "type", "radio");
    			attr(input4, "name", "is_public");
    			input4.__value = 1;
    			input4.value = input4.__value;
    			/*$$binding_groups*/ ctx[8][0].push(input4);
    			attr(button, "class", "btn btn-primary svelte-lp31s3");
    			attr(div0, "class", "d-flex flex-column justify-content-center col-md-8");
    			attr(div1, "class", "login-portion d-flex flex-row col-md-6 justify-content-center svelte-lp31s3");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, h1);
    			append(div0, t1);
    			if (if_block0) if_block0.m(div0, null);
    			append(div0, t2);
    			append(div0, label0);
    			append(div0, t4);
    			append(div0, input0);
    			set_input_value(input0, /*formData*/ ctx[0].username);
    			append(div0, t5);
    			append(div0, label1);
    			append(div0, t7);
    			append(div0, input1);
    			set_input_value(input1, /*formData*/ ctx[0].email);
    			append(div0, t8);
    			append(div0, label2);
    			append(div0, t10);
    			append(div0, input2);
    			set_input_value(input2, /*formData*/ ctx[0].password);
    			append(div0, t11);
    			append(div0, label3);
    			append(div0, t13);
    			append(div0, select);
    			if (if_block1) if_block1.m(select, null);
    			append(select, if_block1_anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			select_option(select, /*formData*/ ctx[0].timezone);
    			append(div0, t14);
    			append(div0, label4);
    			append(label4, input3);
    			input3.checked = input3.__value === /*formData*/ ctx[0].is_public;
    			append(label4, t15);
    			append(div0, t16);
    			append(div0, label5);
    			append(label5, input4);
    			input4.checked = input4.__value === /*formData*/ ctx[0].is_public;
    			append(label5, t17);
    			append(div0, t18);
    			append(div0, button);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "input", /*input0_input_handler*/ ctx[3]),
    					listen(input1, "input", /*input1_input_handler*/ ctx[4]),
    					listen(input2, "input", /*input2_input_handler*/ ctx[5]),
    					listen(select, "change", /*select_change_handler*/ ctx[6]),
    					listen(input3, "change", /*input3_change_handler*/ ctx[7]),
    					listen(input4, "change", /*input4_change_handler*/ ctx[9]),
    					listen(button, "click", /*register*/ ctx[2])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (/*$registrationErrors*/ ctx[1].length) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1$6(ctx);
    					if_block0.c();
    					if_block0.m(div0, t2);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty & /*formData, timeZones*/ 1 && input0.value !== /*formData*/ ctx[0].username) {
    				set_input_value(input0, /*formData*/ ctx[0].username);
    			}

    			if (dirty & /*formData, timeZones*/ 1 && input1.value !== /*formData*/ ctx[0].email) {
    				set_input_value(input1, /*formData*/ ctx[0].email);
    			}

    			if (dirty & /*formData, timeZones*/ 1 && input2.value !== /*formData*/ ctx[0].password) {
    				set_input_value(input2, /*formData*/ ctx[0].password);
    			}

    			if (dirty & /*timeZones*/ 0) {
    				each_value = client.timeZones;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$7(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$7(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*formData, timeZones*/ 1) {
    				select_option(select, /*formData*/ ctx[0].timezone);
    			}

    			if (dirty & /*formData, timeZones*/ 1) {
    				input3.checked = input3.__value === /*formData*/ ctx[0].is_public;
    			}

    			if (dirty & /*formData, timeZones*/ 1) {
    				input4.checked = input4.__value === /*formData*/ ctx[0].is_public;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			destroy_each(each_blocks, detaching);
    			/*$$binding_groups*/ ctx[8][0].splice(/*$$binding_groups*/ ctx[8][0].indexOf(input3), 1);
    			/*$$binding_groups*/ ctx[8][0].splice(/*$$binding_groups*/ ctx[8][0].indexOf(input4), 1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    let placeholder$3 = "---Select a Timezone---";

    function instance$e($$self, $$props, $$invalidate) {
    	let $registrationErrors;
    	component_subscribe($$self, registrationErrors, $$value => $$invalidate(1, $registrationErrors = $$value));

    	let formData = {
    		username: "",
    		password: "",
    		email: "",
    		timezone: "",
    		is_public: 1
    	};

    	function register() {
    		fetch("/api/auth/registration", {
    			method: 'POST',
    			credentials: 'include',
    			headers: { 'Content-Type': 'application/json' },
    			body: JSON.stringify(formData)
    		}).then(response => response.json()).then(data => {
    			if (data.status !== "success") {
    				throw data.message;
    			}

    			userId.update(user_id => data.user_id);
    			return fetch("/api/auth/integrations/spotify");
    		}).then(response => response.json()).then(connectUrl => {
    			window.location.href = connectUrl;
    		}).catch(err => {
    			registrationErrors.update(() => [err]);
    		});
    	}

    	const $$binding_groups = [[]];

    	function input0_input_handler() {
    		formData.username = this.value;
    		$$invalidate(0, formData);
    	}

    	function input1_input_handler() {
    		formData.email = this.value;
    		$$invalidate(0, formData);
    	}

    	function input2_input_handler() {
    		formData.password = this.value;
    		$$invalidate(0, formData);
    	}

    	function select_change_handler() {
    		formData.timezone = select_value(this);
    		$$invalidate(0, formData);
    	}

    	function input3_change_handler() {
    		formData.is_public = this.__value;
    		$$invalidate(0, formData);
    	}

    	function input4_change_handler() {
    		formData.is_public = this.__value;
    		$$invalidate(0, formData);
    	}

    	return [
    		formData,
    		$registrationErrors,
    		register,
    		input0_input_handler,
    		input1_input_handler,
    		input2_input_handler,
    		select_change_handler,
    		input3_change_handler,
    		$$binding_groups,
    		input4_change_handler
    	];
    }

    class Registration extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$e, create_fragment$e, safe_not_equal, {});
    	}
    }

    /* src/views/components/Login.svelte generated by Svelte v3.46.4 */

    function get_each_context$6(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (46:8) {#if $loginErrors.length}
    function create_if_block$7(ctx) {
    	let each_1_anchor;
    	let each_value = /*$loginErrors*/ ctx[2];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$6(get_each_context$6(ctx, each_value, i));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$loginErrors*/ 4) {
    				each_value = /*$loginErrors*/ ctx[2];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$6(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$6(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (47:12) {#each $loginErrors as error}
    function create_each_block$6(ctx) {
    	let div;
    	let t0_value = /*error*/ ctx[6] + "";
    	let t0;
    	let t1;

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			attr(div, "class", "alert alert-danger");
    			attr(div, "role", "alert");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$loginErrors*/ 4 && t0_value !== (t0_value = /*error*/ ctx[6] + "")) set_data(t0, t0_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function create_fragment$d(ctx) {
    	let div1;
    	let div0;
    	let h1;
    	let t1;
    	let t2;
    	let label0;
    	let t4;
    	let input0;
    	let t5;
    	let label1;
    	let t7;
    	let input1;
    	let t8;
    	let button;
    	let mounted;
    	let dispose;
    	let if_block = /*$loginErrors*/ ctx[2].length && create_if_block$7(ctx);

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Login";
    			t1 = space();
    			if (if_block) if_block.c();
    			t2 = space();
    			label0 = element("label");
    			label0.textContent = "Username";
    			t4 = space();
    			input0 = element("input");
    			t5 = space();
    			label1 = element("label");
    			label1.textContent = "Password";
    			t7 = space();
    			input1 = element("input");
    			t8 = space();
    			button = element("button");
    			button.textContent = "Login";
    			attr(label0, "for", "username");
    			attr(input0, "name", "username");
    			attr(label1, "for", "password");
    			attr(input1, "type", "password");
    			attr(input1, "name", "password");
    			attr(button, "class", "btn btn-primary mt-auto svelte-lp31s3");
    			attr(div0, "class", "d-flex flex-column col-md-8");
    			attr(div1, "class", "login-portion d-flex flex-row col-md-6 justify-content-center svelte-lp31s3");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, h1);
    			append(div0, t1);
    			if (if_block) if_block.m(div0, null);
    			append(div0, t2);
    			append(div0, label0);
    			append(div0, t4);
    			append(div0, input0);
    			set_input_value(input0, /*username*/ ctx[0]);
    			append(div0, t5);
    			append(div0, label1);
    			append(div0, t7);
    			append(div0, input1);
    			set_input_value(input1, /*password*/ ctx[1]);
    			append(div0, t8);
    			append(div0, button);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "input", /*input0_input_handler*/ ctx[4]),
    					listen(input1, "input", /*input1_input_handler*/ ctx[5]),
    					listen(button, "click", /*login*/ ctx[3])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (/*$loginErrors*/ ctx[2].length) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$7(ctx);
    					if_block.c();
    					if_block.m(div0, t2);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*username*/ 1 && input0.value !== /*username*/ ctx[0]) {
    				set_input_value(input0, /*username*/ ctx[0]);
    			}

    			if (dirty & /*password*/ 2 && input1.value !== /*password*/ ctx[1]) {
    				set_input_value(input1, /*password*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$d($$self, $$props, $$invalidate) {
    	let $loginErrors;
    	component_subscribe($$self, loginErrors, $$value => $$invalidate(2, $loginErrors = $$value));
    	let username = "";
    	let password = "";

    	function login() {
    		fetch("/api/auth/login", {
    			method: 'POST',
    			credentials: 'include',
    			headers: { 'Content-Type': 'application/json' },
    			body: JSON.stringify({ username, password })
    		}).then(response => response.json()).then(data => {
    			if (data.connected) {
    				userId.update(user_id => data.user_id);
    				window.location.href = data.redirectUrl;
    			} else if (data.status === "error") {
    				throw data.message;
    			} else {
    				return fetch("/api/auth/integrations/spotify");
    			}
    		}).then(response => response.json()).then(connectUrl => {
    			window.location.href = connectUrl;
    		}).catch(err => {
    			loginErrors.update(() => [err]);
    		});
    	}

    	function input0_input_handler() {
    		username = this.value;
    		$$invalidate(0, username);
    	}

    	function input1_input_handler() {
    		password = this.value;
    		$$invalidate(1, password);
    	}

    	return [
    		username,
    		password,
    		$loginErrors,
    		login,
    		input0_input_handler,
    		input1_input_handler
    	];
    }

    class Login extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$d, create_fragment$d, safe_not_equal, {});
    	}
    }

    /* src/views/Login.svelte generated by Svelte v3.46.4 */

    function create_fragment$c(ctx) {
    	let t0;
    	let div1;
    	let div0;
    	let login;
    	let t1;
    	let registration;
    	let current;
    	login = new Login({});
    	registration = new Registration({});

    	return {
    		c() {
    			t0 = space();
    			div1 = element("div");
    			div0 = element("div");
    			create_component(login.$$.fragment);
    			t1 = space();
    			create_component(registration.$$.fragment);
    			document.title = "Login";
    			attr(div0, "class", "d-flex flex-row col-md-8");
    			attr(div1, "class", "d-flex flex-row justify-content-center");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, div1, anchor);
    			append(div1, div0);
    			mount_component(login, div0, null);
    			append(div0, t1);
    			mount_component(registration, div0, null);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(login.$$.fragment, local);
    			transition_in(registration.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(login.$$.fragment, local);
    			transition_out(registration.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(div1);
    			destroy_component(login);
    			destroy_component(registration);
    		}
    	};
    }

    class Login_1 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$c, safe_not_equal, {});
    	}
    }

    /* src/views/Logout.svelte generated by Svelte v3.46.4 */

    function instance$c($$self) {
    	onMount(() => {
    		userId.update(user_id => null);
    		client.redirectFetch("/api/auth/logout", window);
    	});

    	return [];
    }

    class Logout extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$c, null, safe_not_equal, {});
    	}
    }

    /* src/views/Profile.svelte generated by Svelte v3.46.4 */

    function create_else_block$5(ctx) {
    	let h1;

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Loading...";
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(h1);
    		}
    	};
    }

    // (47:18) 
    function create_if_block_2$5(ctx) {
    	let h1;

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "User Not Logged In";
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(h1);
    		}
    	};
    }

    // (42:0) {#if username}
    function create_if_block$6(ctx) {
    	let h1;
    	let t0;
    	let t1;
    	let if_block_anchor;
    	let if_block = /*schedules*/ ctx[2].length && create_if_block_1$5();

    	return {
    		c() {
    			h1 = element("h1");
    			t0 = text(/*username*/ ctx[0]);
    			t1 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			append(h1, t0);
    			insert(target, t1, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*username*/ 1) set_data(t0, /*username*/ ctx[0]);
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (44:4) {#if schedules.length}
    function create_if_block_1$5(ctx) {
    	let h2;

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Schedules";
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    		}
    	};
    }

    function create_fragment$b(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*username*/ ctx[0]) return create_if_block$6;
    		if (/*failure*/ ctx[1]) return create_if_block_2$5;
    		return create_else_block$5;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let $userId;
    	component_subscribe($$self, userId, $$value => $$invalidate(4, $userId = $$value));
    	let { params } = $$props;
    	let username;
    	let schedules = [];
    	let failure = false;

    	function getData() {
    		let uid;

    		if (!params) {
    			uid = $userId;
    		} else {
    			uid = params.uid;
    		}

    		if (!uid) {
    			$$invalidate(1, failure = true);
    			return;
    		}

    		fetch(`/api/vibechek/users/${uid}`).then(response => response.json()).then(data => {
    			$$invalidate(0, username = data.username);
    			return fetch(`/api/vibechek/users/${uid}/schedules`);
    		}).then(response => response.json()).then(data => {
    			
    		}).catch(err => {
    			
    		});
    	}

    	onMount(getData);

    	$$self.$$set = $$props => {
    		if ('params' in $$props) $$invalidate(3, params = $$props.params);
    	};

    	return [username, failure, schedules, params];
    }

    class Profile extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { params: 3 });
    	}
    }

    /* src/views/SessionCheck.svelte generated by Svelte v3.46.4 */

    function instance$a($$self) {
    	onMount(() => {
    		client.redirectFetch("/api/auth/login_check", window);
    	});

    	return [];
    }

    class SessionCheck extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$a, null, safe_not_equal, {});
    	}
    }

    /* src/views/NotFound.svelte generated by Svelte v3.46.4 */

    function create_fragment$a(ctx) {
    	let h1;
    	let t1;
    	let p;

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Whoops!";
    			t1 = space();
    			p = element("p");
    			p.textContent = "It looks like the page you were looking for isn't available. If this page should exist, please contact support!";
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			insert(target, p, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			if (detaching) detach(p);
    		}
    	};
    }

    class NotFound extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$a, safe_not_equal, {});
    	}
    }

    /* src/views/components/creator/CreatorSwitch.svelte generated by Svelte v3.46.4 */

    function create_fragment$9(ctx) {
    	let button0;
    	let t1;
    	let button1;
    	let t3;
    	let button2;
    	let t5;
    	let button3;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button0 = element("button");
    			button0.textContent = "Schedule Mode";
    			t1 = space();
    			button1 = element("button");
    			button1.textContent = "Vibe Day Mode";
    			t3 = space();
    			button2 = element("button");
    			button2.textContent = "Vibe Block Mode";
    			t5 = space();
    			button3 = element("button");
    			button3.textContent = "Playlist Search Mode";
    			attr(button0, "class", "btn");
    			attr(button1, "class", "btn");
    			attr(button2, "class", "btn");
    			attr(button3, "class", "btn");
    		},
    		m(target, anchor) {
    			insert(target, button0, anchor);
    			insert(target, t1, anchor);
    			insert(target, button1, anchor);
    			insert(target, t3, anchor);
    			insert(target, button2, anchor);
    			insert(target, t5, anchor);
    			insert(target, button3, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*switchToScheduleMode*/ ctx[0]),
    					listen(button1, "click", /*switchToDayMode*/ ctx[1]),
    					listen(button2, "click", /*switchToBlockMode*/ ctx[2]),
    					listen(button3, "click", /*switchToPlaylistMode*/ ctx[3])
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(button0);
    			if (detaching) detach(t1);
    			if (detaching) detach(button1);
    			if (detaching) detach(t3);
    			if (detaching) detach(button2);
    			if (detaching) detach(t5);
    			if (detaching) detach(button3);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$9($$self) {
    	function switchToScheduleMode() {
    		creatorMode.update(value => "schedule");
    	}

    	function switchToDayMode() {
    		creatorMode.update(value => "vibe_day");
    	}

    	function switchToBlockMode() {
    		creatorMode.update(value => "vibe_block");
    	}

    	function switchToPlaylistMode() {
    		creatorMode.update(value => "playlist_search");
    	}

    	return [switchToScheduleMode, switchToDayMode, switchToBlockMode, switchToPlaylistMode];
    }

    class CreatorSwitch extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {});
    	}
    }

    /* src/views/components/creator/ScheduleCreator.svelte generated by Svelte v3.46.4 */

    function get_each_context$5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[14] = list[i];
    	child_ctx[15] = list;
    	child_ctx[16] = i;
    	return child_ctx;
    }

    function get_each_context_1$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[17] = list[i];
    	return child_ctx;
    }

    // (74:8) {#if !availableVibeDays.length && loaded}
    function create_if_block_2$4(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.textContent = "You don't have any Vibe Days to put in your schedule. Make some\n                in Vibe Day mode first and come back!";
    			attr(div, "class", "alert alert-danger");
    			attr(div, "role", "alert");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (113:32) {#if placeholder}
    function create_if_block_1$4(ctx) {
    	let option;

    	return {
    		c() {
    			option = element("option");
    			option.textContent = `${placeholder$2}`;
    			option.__value = "";
    			option.value = option.__value;
    			option.disabled = true;
    			option.selected = true;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (118:32) {#each availableVibeDays as vibeDay}
    function create_each_block_1$2(ctx) {
    	let option;
    	let t_value = /*vibeDay*/ ctx[17].name + "";
    	let t;
    	let option_value_value;

    	return {
    		c() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = option_value_value = /*vibeDay*/ ctx[17].vibe_day_id;
    			option.value = option.__value;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*availableVibeDays*/ 2 && t_value !== (t_value = /*vibeDay*/ ctx[17].name + "")) set_data(t, t_value);

    			if (dirty & /*availableVibeDays*/ 2 && option_value_value !== (option_value_value = /*vibeDay*/ ctx[17].vibe_day_id)) {
    				option.__value = option_value_value;
    				option.value = option.__value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (103:16) {#each daysOfTheWeek as weekDay, i}
    function create_each_block$5(ctx) {
    	let tr;
    	let td0;
    	let label;
    	let t0_value = /*weekDay*/ ctx[14] + "";
    	let t0;
    	let label_for_value;
    	let t1;
    	let td1;
    	let select;
    	let if_block_anchor;
    	let select_name_value;
    	let t2;
    	let mounted;
    	let dispose;
    	let if_block = create_if_block_1$4();
    	let each_value_1 = /*availableVibeDays*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$2(get_each_context_1$2(ctx, each_value_1, i));
    	}

    	function select_change_handler() {
    		/*select_change_handler*/ ctx[10].call(select, /*i*/ ctx[16]);
    	}

    	return {
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			label = element("label");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			select = element("select");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			attr(label, "for", label_for_value = /*weekDay*/ ctx[14]);
    			attr(select, "name", select_name_value = /*weekDay*/ ctx[14]);
    			if (/*selectedVibeDays*/ ctx[2][/*i*/ ctx[16]] === void 0) add_render_callback(select_change_handler);
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, label);
    			append(label, t0);
    			append(tr, t1);
    			append(tr, td1);
    			append(td1, select);
    			if (if_block) if_block.m(select, null);
    			append(select, if_block_anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			select_option(select, /*selectedVibeDays*/ ctx[2][/*i*/ ctx[16]]);
    			append(tr, t2);

    			if (!mounted) {
    				dispose = listen(select, "change", select_change_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if_block.p(ctx, dirty);

    			if (dirty & /*availableVibeDays*/ 2) {
    				each_value_1 = /*availableVibeDays*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$2(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (dirty & /*selectedVibeDays, availableVibeDays*/ 6) {
    				select_option(select, /*selectedVibeDays*/ ctx[2][/*i*/ ctx[16]]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    			if (if_block) if_block.d();
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (131:8) {:else}
    function create_else_block$4(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "Create";
    			attr(button, "class", "btn btn-primary");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*createSchedule*/ ctx[5]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	let div3;
    	let div0;
    	let t0;
    	let div2;
    	let t1;
    	let label0;
    	let t3;
    	let input0;
    	let t4;
    	let label1;
    	let input1;
    	let t5;
    	let t6;
    	let label2;
    	let input2;
    	let t7;
    	let t8;
    	let div1;
    	let table;
    	let t9;
    	let mounted;
    	let dispose;
    	let if_block0 = !/*availableVibeDays*/ ctx[1].length && /*loaded*/ ctx[3] && create_if_block_2$4();
    	let each_value = /*daysOfTheWeek*/ ctx[4];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
    	}

    	function select_block_type(ctx, dirty) {
    		return create_else_block$4;
    	}

    	let current_block_type = select_block_type();
    	let if_block1 = current_block_type(ctx);

    	return {
    		c() {
    			div3 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div2 = element("div");
    			if (if_block0) if_block0.c();
    			t1 = space();
    			label0 = element("label");
    			label0.textContent = "Schedule Name";
    			t3 = space();
    			input0 = element("input");
    			t4 = space();
    			label1 = element("label");
    			input1 = element("input");
    			t5 = text("\n            Private Schedule");
    			t6 = space();
    			label2 = element("label");
    			input2 = element("input");
    			t7 = text("\n            Public Schedule");
    			t8 = space();
    			div1 = element("div");
    			table = element("table");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t9 = space();
    			if_block1.c();
    			attr(label0, "for", "schedule_name");
    			attr(input0, "name", "schedule_name");
    			attr(input1, "type", "radio");
    			attr(input1, "name", "is_public");
    			input1.__value = 0;
    			input1.value = input1.__value;
    			/*$$binding_groups*/ ctx[8][0].push(input1);
    			attr(input2, "type", "radio");
    			attr(input2, "name", "is_public");
    			input2.__value = 1;
    			input2.value = input2.__value;
    			/*$$binding_groups*/ ctx[8][0].push(input2);
    		},
    		m(target, anchor) {
    			insert(target, div3, anchor);
    			append(div3, div0);
    			append(div3, t0);
    			append(div3, div2);
    			if (if_block0) if_block0.m(div2, null);
    			append(div2, t1);
    			append(div2, label0);
    			append(div2, t3);
    			append(div2, input0);
    			set_input_value(input0, /*formData*/ ctx[0].name);
    			append(div2, t4);
    			append(div2, label1);
    			append(label1, input1);
    			input1.checked = input1.__value === /*formData*/ ctx[0].is_public;
    			append(label1, t5);
    			append(div2, t6);
    			append(div2, label2);
    			append(label2, input2);
    			input2.checked = input2.__value === /*formData*/ ctx[0].is_public;
    			append(label2, t7);
    			append(div2, t8);
    			append(div2, div1);
    			append(div1, table);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(table, null);
    			}

    			append(div2, t9);
    			if_block1.m(div2, null);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "input", /*input0_input_handler*/ ctx[6]),
    					listen(input1, "change", /*input1_change_handler*/ ctx[7]),
    					listen(input2, "change", /*input2_change_handler*/ ctx[9])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!/*availableVibeDays*/ ctx[1].length && /*loaded*/ ctx[3]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_2$4();
    					if_block0.c();
    					if_block0.m(div2, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty & /*formData*/ 1 && input0.value !== /*formData*/ ctx[0].name) {
    				set_input_value(input0, /*formData*/ ctx[0].name);
    			}

    			if (dirty & /*formData*/ 1) {
    				input1.checked = input1.__value === /*formData*/ ctx[0].is_public;
    			}

    			if (dirty & /*formData*/ 1) {
    				input2.checked = input2.__value === /*formData*/ ctx[0].is_public;
    			}

    			if (dirty & /*daysOfTheWeek, selectedVibeDays, availableVibeDays, placeholder*/ 22) {
    				each_value = /*daysOfTheWeek*/ ctx[4];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$5(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$5(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(table, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if_block1.p(ctx, dirty);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div3);
    			if (if_block0) if_block0.d();
    			/*$$binding_groups*/ ctx[8][0].splice(/*$$binding_groups*/ ctx[8][0].indexOf(input1), 1);
    			/*$$binding_groups*/ ctx[8][0].splice(/*$$binding_groups*/ ctx[8][0].indexOf(input2), 1);
    			destroy_each(each_blocks, detaching);
    			if_block1.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }
    let placeholder$2 = "---Select a Vibe Day---";

    function instance$8($$self, $$props, $$invalidate) {
    	let $userId;
    	component_subscribe($$self, userId, $$value => $$invalidate(11, $userId = $$value));
    	let formData = { name: "", id: "", is_public: 1 };
    	let availableVibeDays = [];
    	let selectedVibeDays = ["", "", "", "", "", "", ""];
    	let daysOfTheWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    	let loaded = false;

    	onMount(() => {
    		fetch(`/api/vibechek/users/${$userId}/vibe_days`).then(response => response.json()).then(data => {
    			if (data.days) {
    				$$invalidate(1, availableVibeDays = data.days);
    			}

    			$$invalidate(3, loaded = true);
    		}).catch(err => {
    			
    		});
    	});

    	function createSchedule() {
    		fetch(`/api/vibechek/users/${$userId}/schedules`, {
    			method: "POST",
    			credentials: "include",
    			headers: { "Content-Type": "application/json" },
    			body: JSON.stringify({
    				scheduleData: formData,
    				days: selectedVibeDays
    			})
    		}).then(response => response.json()).then(data => {
    			if (data.statusCode) {
    				throw data.message;
    			} else {
    				alert("Schedule created successfully! Head on over to the home tab and listen!");
    			}
    		}).catch(err => {
    			
    		});
    	}

    	const $$binding_groups = [[]];

    	function input0_input_handler() {
    		formData.name = this.value;
    		$$invalidate(0, formData);
    	}

    	function input1_change_handler() {
    		formData.is_public = this.__value;
    		$$invalidate(0, formData);
    	}

    	function input2_change_handler() {
    		formData.is_public = this.__value;
    		$$invalidate(0, formData);
    	}

    	function select_change_handler(i) {
    		selectedVibeDays[i] = select_value(this);
    		$$invalidate(2, selectedVibeDays);
    		$$invalidate(1, availableVibeDays);
    	}

    	return [
    		formData,
    		availableVibeDays,
    		selectedVibeDays,
    		loaded,
    		daysOfTheWeek,
    		createSchedule,
    		input0_input_handler,
    		input1_change_handler,
    		$$binding_groups,
    		input2_change_handler,
    		select_change_handler
    	];
    }

    class ScheduleCreator extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {});
    	}
    }

    /* src/views/components/creator/BlockCreator.svelte generated by Svelte v3.46.4 */

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[12] = list[i];
    	return child_ctx;
    }

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[15] = list[i];
    	return child_ctx;
    }

    function get_each_context_2$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[18] = list[i];
    	return child_ctx;
    }

    // (59:8) {#if !availablePlaylists.length && loaded}
    function create_if_block_2$3(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.textContent = "You don't have any playlists to put in your block. Save some in\n                Playlist Search mode first and come back!";
    			attr(div, "class", "alert alert-danger");
    			attr(div, "role", "alert");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (74:16) {#if placeholder}
    function create_if_block_1$3(ctx) {
    	let option;
    	let t;
    	let option_selected_value;

    	return {
    		c() {
    			option = element("option");
    			t = text(placeholder$1);
    			option.__value = "";
    			option.value = option.__value;
    			option.disabled = true;
    			option.selected = option_selected_value = /*formData*/ ctx[1].playlist ? true : null;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*formData, availablePlaylists*/ 6 && option_selected_value !== (option_selected_value = /*formData*/ ctx[1].playlist ? true : null)) {
    				option.selected = option_selected_value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (77:16) {#each availablePlaylists as playlist}
    function create_each_block_2$1(ctx) {
    	let option;
    	let t0_value = /*playlist*/ ctx[18].name + "";
    	let t0;
    	let t1;
    	let option_value_value;
    	let option_selected_value;

    	return {
    		c() {
    			option = element("option");
    			t0 = text(t0_value);
    			t1 = space();
    			option.__value = option_value_value = /*playlist*/ ctx[18].uri;
    			option.value = option.__value;
    			option.selected = option_selected_value = /*playlist*/ ctx[18].uri === /*formData*/ ctx[1].playlist || null;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t0);
    			append(option, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*availablePlaylists*/ 4 && t0_value !== (t0_value = /*playlist*/ ctx[18].name + "")) set_data(t0, t0_value);

    			if (dirty & /*availablePlaylists*/ 4 && option_value_value !== (option_value_value = /*playlist*/ ctx[18].uri)) {
    				option.__value = option_value_value;
    				option.value = option.__value;
    			}

    			if (dirty & /*availablePlaylists, formData*/ 6 && option_selected_value !== (option_selected_value = /*playlist*/ ctx[18].uri === /*formData*/ ctx[1].playlist || null)) {
    				option.selected = option_selected_value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (90:16) {#each possibleHourValues as hours}
    function create_each_block_1$1(ctx) {
    	let option;
    	let t0_value = /*hours*/ ctx[15] + "";
    	let t0;
    	let t1;
    	let option_value_value;
    	let option_selected_value;

    	return {
    		c() {
    			option = element("option");
    			t0 = text(t0_value);
    			t1 = space();
    			option.__value = option_value_value = /*hours*/ ctx[15];
    			option.value = option.__value;
    			option.selected = option_selected_value = /*hours*/ ctx[15] === /*formData*/ ctx[1].hours || null;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t0);
    			append(option, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*formData, availablePlaylists*/ 6 && option_selected_value !== (option_selected_value = /*hours*/ ctx[15] === /*formData*/ ctx[1].hours || null)) {
    				option.selected = option_selected_value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (104:16) {#each possibleMinuteValues as minutes}
    function create_each_block$4(ctx) {
    	let option;
    	let t0_value = /*minutes*/ ctx[12] + "";
    	let t0;
    	let t1;
    	let option_value_value;
    	let option_selected_value;

    	return {
    		c() {
    			option = element("option");
    			t0 = text(t0_value);
    			t1 = space();
    			option.__value = option_value_value = /*minutes*/ ctx[12];
    			option.value = option.__value;
    			option.selected = option_selected_value = /*minutes*/ ctx[12] === /*formData*/ ctx[1].minutes || null;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t0);
    			append(option, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*formData, availablePlaylists*/ 6 && option_selected_value !== (option_selected_value = /*minutes*/ ctx[12] === /*formData*/ ctx[1].minutes || null)) {
    				option.selected = option_selected_value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (116:8) {:else}
    function create_else_block$3(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "Create";
    			attr(button, "class", "btn btn-primary");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*createBlock*/ ctx[5]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$7(ctx) {
    	let div4;
    	let div0;
    	let t0;
    	let div3;
    	let t1;
    	let label0;
    	let t3;
    	let input;
    	let t4;
    	let div1;
    	let label1;
    	let t6;
    	let select0;
    	let if_block1_anchor;
    	let t7;
    	let div2;
    	let label2;
    	let t9;
    	let select1;
    	let t10;
    	let label3;
    	let t12;
    	let select2;
    	let t13;
    	let mounted;
    	let dispose;
    	let if_block0 = !/*availablePlaylists*/ ctx[2].length && /*loaded*/ ctx[0] && create_if_block_2$3();
    	let if_block1 = create_if_block_1$3(ctx);
    	let each_value_2 = /*availablePlaylists*/ ctx[2];
    	let each_blocks_2 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2$1(get_each_context_2$1(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*possibleHourValues*/ ctx[3];
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	let each_value = /*possibleMinuteValues*/ ctx[4];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	function select_block_type(ctx, dirty) {
    		return create_else_block$3;
    	}

    	let current_block_type = select_block_type();
    	let if_block2 = current_block_type(ctx);

    	return {
    		c() {
    			div4 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div3 = element("div");
    			if (if_block0) if_block0.c();
    			t1 = space();
    			label0 = element("label");
    			label0.textContent = "Vibe Block Name";
    			t3 = space();
    			input = element("input");
    			t4 = space();
    			div1 = element("div");
    			label1 = element("label");
    			label1.textContent = "Select a playlist:";
    			t6 = space();
    			select0 = element("select");
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t7 = space();
    			div2 = element("div");
    			label2 = element("label");
    			label2.textContent = "Hours:";
    			t9 = space();
    			select1 = element("select");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t10 = space();
    			label3 = element("label");
    			label3.textContent = "Minutes:";
    			t12 = space();
    			select2 = element("select");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t13 = space();
    			if_block2.c();
    			attr(label0, "for", "name");
    			attr(input, "name", "name");
    			attr(label1, "for", "playlist");
    			attr(select0, "name", "playlist");
    			if (/*formData*/ ctx[1].playlist === void 0) add_render_callback(() => /*select0_change_handler*/ ctx[7].call(select0));
    			attr(label2, "for", "block_hours");
    			attr(select1, "name", "block_hours");
    			if (/*formData*/ ctx[1].hours === void 0) add_render_callback(() => /*select1_change_handler*/ ctx[8].call(select1));
    			attr(label3, "for", "block_minutes");
    			attr(select2, "name", "block_minutes");
    			if (/*formData*/ ctx[1].minutes === void 0) add_render_callback(() => /*select2_change_handler*/ ctx[9].call(select2));
    		},
    		m(target, anchor) {
    			insert(target, div4, anchor);
    			append(div4, div0);
    			append(div4, t0);
    			append(div4, div3);
    			if (if_block0) if_block0.m(div3, null);
    			append(div3, t1);
    			append(div3, label0);
    			append(div3, t3);
    			append(div3, input);
    			set_input_value(input, /*formData*/ ctx[1].name);
    			append(div3, t4);
    			append(div3, div1);
    			append(div1, label1);
    			append(div1, t6);
    			append(div1, select0);
    			if (if_block1) if_block1.m(select0, null);
    			append(select0, if_block1_anchor);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(select0, null);
    			}

    			select_option(select0, /*formData*/ ctx[1].playlist);
    			append(div3, t7);
    			append(div3, div2);
    			append(div2, label2);
    			append(div2, t9);
    			append(div2, select1);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(select1, null);
    			}

    			select_option(select1, /*formData*/ ctx[1].hours);
    			append(div2, t10);
    			append(div2, label3);
    			append(div2, t12);
    			append(div2, select2);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select2, null);
    			}

    			select_option(select2, /*formData*/ ctx[1].minutes);
    			append(div3, t13);
    			if_block2.m(div3, null);

    			if (!mounted) {
    				dispose = [
    					listen(input, "input", /*input_input_handler*/ ctx[6]),
    					listen(select0, "change", /*select0_change_handler*/ ctx[7]),
    					listen(select1, "change", /*select1_change_handler*/ ctx[8]),
    					listen(select2, "change", /*select2_change_handler*/ ctx[9])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!/*availablePlaylists*/ ctx[2].length && /*loaded*/ ctx[0]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_2$3();
    					if_block0.c();
    					if_block0.m(div3, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty & /*formData, availablePlaylists*/ 6 && input.value !== /*formData*/ ctx[1].name) {
    				set_input_value(input, /*formData*/ ctx[1].name);
    			}

    			if_block1.p(ctx, dirty);

    			if (dirty & /*availablePlaylists, formData*/ 6) {
    				each_value_2 = /*availablePlaylists*/ ctx[2];
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2$1(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_2[i] = create_each_block_2$1(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(select0, null);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}

    				each_blocks_2.length = each_value_2.length;
    			}

    			if (dirty & /*formData, availablePlaylists*/ 6) {
    				select_option(select0, /*formData*/ ctx[1].playlist);
    			}

    			if (dirty & /*possibleHourValues, formData*/ 10) {
    				each_value_1 = /*possibleHourValues*/ ctx[3];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1$1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(select1, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty & /*formData, availablePlaylists*/ 6) {
    				select_option(select1, /*formData*/ ctx[1].hours);
    			}

    			if (dirty & /*possibleMinuteValues, formData*/ 18) {
    				each_value = /*possibleMinuteValues*/ ctx[4];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select2, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*formData, availablePlaylists*/ 6) {
    				select_option(select2, /*formData*/ ctx[1].minutes);
    			}

    			if_block2.p(ctx, dirty);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div4);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			destroy_each(each_blocks_2, detaching);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    			if_block2.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    let placeholder$1 = "---Select a Playlist---";

    function instance$7($$self, $$props, $$invalidate) {
    	let $userId;
    	component_subscribe($$self, userId, $$value => $$invalidate(10, $userId = $$value));
    	let loaded = false;

    	let formData = {
    		name: "",
    		playlist: "",
    		hours: 0,
    		minutes: 0
    	};

    	let availablePlaylists = [];
    	const possibleHourValues = [...Array(13).keys()];
    	const possibleMinuteValues = [0, 30];

    	onMount(() => {
    		fetch(`/api/vibechek/users/${$userId}/playlists`).then(response => response.json()).then(data => {
    			if (data.playlists) {
    				$$invalidate(2, availablePlaylists = data.playlists);
    			}

    			$$invalidate(0, loaded = true);
    		}).catch(err => {
    			
    		});
    	});

    	function createBlock() {
    		fetch(`/api/vibechek/users/${$userId}/vibe_blocks`, {
    			method: "POST",
    			credentials: "include",
    			headers: { "Content-Type": "application/json" },
    			body: JSON.stringify(formData)
    		}).then(response => response.json()).then(data => {
    			if (data.statusCode) {
    				throw data.message;
    			} else {
    				alert("Block created successfully!");
    			}
    		}).catch(err => {
    			
    		});
    	}

    	function input_input_handler() {
    		formData.name = this.value;
    		$$invalidate(1, formData);
    		$$invalidate(2, availablePlaylists);
    	}

    	function select0_change_handler() {
    		formData.playlist = select_value(this);
    		$$invalidate(1, formData);
    		$$invalidate(2, availablePlaylists);
    	}

    	function select1_change_handler() {
    		formData.hours = select_value(this);
    		$$invalidate(1, formData);
    		$$invalidate(2, availablePlaylists);
    	}

    	function select2_change_handler() {
    		formData.minutes = select_value(this);
    		$$invalidate(1, formData);
    		$$invalidate(2, availablePlaylists);
    	}

    	return [
    		loaded,
    		formData,
    		availablePlaylists,
    		possibleHourValues,
    		possibleMinuteValues,
    		createBlock,
    		input_input_handler,
    		select0_change_handler,
    		select1_change_handler,
    		select2_change_handler
    	];
    }

    class BlockCreator extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {});
    	}
    }

    /* src/views/components/creator/CreatorBlockSlot.svelte generated by Svelte v3.46.4 */

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[12] = list[i].block;
    	child_ctx[13] = list[i].i;
    	child_ctx[14] = list[i].hours;
    	child_ctx[15] = list[i].minutes;
    	return child_ctx;
    }

    // (44:0) {#if data.state !== "taken"}
    function create_if_block$5(ctx) {
    	let div;
    	let t0;
    	let h6;
    	let t1_value = client.timePad(/*data*/ ctx[0].hour) + "";
    	let t1;
    	let t2;
    	let t3_value = client.timePad(/*data*/ ctx[0].minute) + "";
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let select;
    	let if_block1_anchor;
    	let t7;
    	let button;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*data*/ ctx[0].block) return create_if_block_2$2;
    		if (/*data*/ ctx[0].state !== "taken") return create_if_block_3$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type && current_block_type(ctx);
    	let if_block1 = create_if_block_1$2();
    	let each_value = /*availableBlocks*/ ctx[1].map(/*func*/ ctx[7]);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			h6 = element("h6");
    			t1 = text(t1_value);
    			t2 = text(":");
    			t3 = text(t3_value);
    			t4 = text(" | ");
    			t5 = text(/*civilianTime*/ ctx[4]);
    			t6 = space();
    			select = element("select");
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t7 = space();
    			button = element("button");
    			button.textContent = "Clear";
    			if (/*selectedBlock*/ ctx[2] === void 0) add_render_callback(() => /*select_change_handler*/ ctx[8].call(select));
    			attr(button, "class", "btn btn-danger");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			append(div, h6);
    			append(h6, t1);
    			append(h6, t2);
    			append(h6, t3);
    			append(h6, t4);
    			append(h6, t5);
    			append(div, t6);
    			append(div, select);
    			if (if_block1) if_block1.m(select, null);
    			append(select, if_block1_anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			select_option(select, /*selectedBlock*/ ctx[2]);
    			append(div, t7);
    			append(div, button);

    			if (!mounted) {
    				dispose = [
    					listen(select, "change", /*select_change_handler*/ ctx[8]),
    					listen(select, "change", /*change_handler*/ ctx[9]),
    					listen(button, "click", /*clear*/ ctx[5])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if (if_block0) if_block0.d(1);
    				if_block0 = current_block_type && current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(div, t0);
    				}
    			}

    			if (dirty & /*data*/ 1 && t1_value !== (t1_value = client.timePad(/*data*/ ctx[0].hour) + "")) set_data(t1, t1_value);
    			if (dirty & /*data*/ 1 && t3_value !== (t3_value = client.timePad(/*data*/ ctx[0].minute) + "")) set_data(t3, t3_value);
    			if (dirty & /*civilianTime*/ 16) set_data(t5, /*civilianTime*/ ctx[4]);
    			if_block1.p(ctx, dirty);

    			if (dirty & /*availableBlocks, secondsToHoursAndMinutes, timePad*/ 2) {
    				each_value = /*availableBlocks*/ ctx[1].map(/*func*/ ctx[7]);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*selectedBlock, availableBlocks, secondsToHoursAndMinutes*/ 6) {
    				select_option(select, /*selectedBlock*/ ctx[2]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);

    			if (if_block0) {
    				if_block0.d();
    			}

    			if (if_block1) if_block1.d();
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (48:37) 
    function create_if_block_3$1(ctx) {
    	let h3;

    	return {
    		c() {
    			h3 = element("h3");
    			h3.textContent = "Available Slot";
    		},
    		m(target, anchor) {
    			insert(target, h3, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(h3);
    		}
    	};
    }

    // (46:4) {#if data.block}
    function create_if_block_2$2(ctx) {
    	let h3;
    	let t_value = /*data*/ ctx[0].block.name + "";
    	let t;

    	return {
    		c() {
    			h3 = element("h3");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, h3, anchor);
    			append(h3, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*data*/ 1 && t_value !== (t_value = /*data*/ ctx[0].block.name + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(h3);
    		}
    	};
    }

    // (55:8) {#if placeholder}
    function create_if_block_1$2(ctx) {
    	let option;
    	let option_value_value;

    	return {
    		c() {
    			option = element("option");
    			option.textContent = `${placeholder}`;
    			option.__value = option_value_value = -1;
    			option.value = option.__value;
    			option.disabled = true;
    			option.selected = true;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (58:8) {#each availableBlocks.map((block, i) => {             return {                 block,                  i,                  hours: secondsToHoursAndMinutes(block.duration).hours,                  minutes: secondsToHoursAndMinutes(block.duration).minutes             };         }) as {block, i, hours, minutes}}
    function create_each_block$3(ctx) {
    	let option;
    	let t0_value = /*block*/ ctx[12].name + "";
    	let t0;
    	let t1;
    	let t2_value = client.timePad(/*hours*/ ctx[14]) + "";
    	let t2;
    	let t3;
    	let t4_value = client.timePad(/*minutes*/ ctx[15]) + "";
    	let t4;
    	let t5;
    	let option_value_value;

    	return {
    		c() {
    			option = element("option");
    			t0 = text(t0_value);
    			t1 = text(" (");
    			t2 = text(t2_value);
    			t3 = text(":");
    			t4 = text(t4_value);
    			t5 = text(")");
    			option.__value = option_value_value = /*i*/ ctx[13];
    			option.value = option.__value;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t0);
    			append(option, t1);
    			append(option, t2);
    			append(option, t3);
    			append(option, t4);
    			append(option, t5);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*availableBlocks*/ 2 && t0_value !== (t0_value = /*block*/ ctx[12].name + "")) set_data(t0, t0_value);
    			if (dirty & /*availableBlocks*/ 2 && t2_value !== (t2_value = client.timePad(/*hours*/ ctx[14]) + "")) set_data(t2, t2_value);
    			if (dirty & /*availableBlocks*/ 2 && t4_value !== (t4_value = client.timePad(/*minutes*/ ctx[15]) + "")) set_data(t4, t4_value);

    			if (dirty & /*availableBlocks*/ 2 && option_value_value !== (option_value_value = /*i*/ ctx[13])) {
    				option.__value = option_value_value;
    				option.value = option.__value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let if_block_anchor;
    	let if_block = /*data*/ ctx[0].state !== "taken" && create_if_block$5(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (/*data*/ ctx[0].state !== "taken") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$5(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    let placeholder = "---Select a Vibe Block---";

    function instance$6($$self, $$props, $$invalidate) {
    	let { data } = $$props;
    	let { availableBlocks } = $$props;
    	let selectedBlock = -1;
    	let mounted = false;
    	let changed = false;
    	let civilianTime = "";
    	let militaryTimeString = "";
    	const dispatch = createEventDispatcher();

    	onMount(() => {
    		if (data.block) {
    			$$invalidate(2, selectedBlock = data.index);
    		}

    		militaryTimeString = `${client.timePad(data.hour)}:${client.timePad(data.minute)}:00`;

    		$$invalidate(4, civilianTime = new Date('1970-01-01T' + militaryTimeString + 'Z').toLocaleTimeString('en-US', {
    			timeZone: 'UTC',
    			hour12: true,
    			hour: 'numeric',
    			minute: 'numeric'
    		}));

    		$$invalidate(6, mounted = true);
    	});

    	function clear() {
    		dispatch('clear');
    		$$invalidate(2, selectedBlock = -1);
    	}

    	const func = (block, i) => {
    		return {
    			block,
    			i,
    			hours: client.secondsToHoursAndMinutes(block.duration).hours,
    			minutes: client.secondsToHoursAndMinutes(block.duration).minutes
    		};
    	};

    	function select_change_handler() {
    		selectedBlock = select_value(this);
    		$$invalidate(2, selectedBlock);
    		$$invalidate(1, availableBlocks);
    	}

    	const change_handler = () => {
    		$$invalidate(3, changed = true);
    	};

    	$$self.$$set = $$props => {
    		if ('data' in $$props) $$invalidate(0, data = $$props.data);
    		if ('availableBlocks' in $$props) $$invalidate(1, availableBlocks = $$props.availableBlocks);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*mounted, changed, selectedBlock, data*/ 77) {
    			if (mounted && changed) {
    				dispatch('selected', { selectedBlock, index: data.index });
    				$$invalidate(3, changed = false);
    			}
    		}
    	};

    	return [
    		data,
    		availableBlocks,
    		selectedBlock,
    		changed,
    		civilianTime,
    		clear,
    		mounted,
    		func,
    		select_change_handler,
    		change_handler
    	];
    }

    class CreatorBlockSlot extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { data: 0, availableBlocks: 1 });
    	}
    }

    /* src/views/components/creator/DayCreator.svelte generated by Svelte v3.46.4 */

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[13] = list[i];
    	child_ctx[15] = i;
    	return child_ctx;
    }

    // (118:8) {#if !availableBlocks.length && loaded}
    function create_if_block_2$1(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.textContent = "You don't have any blocks to put in your day. Make some in Block\n                Creator mode first and come back!";
    			attr(div, "class", "alert alert-danger");
    			attr(div, "role", "alert");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (130:8) {:else}
    function create_else_block$2(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "Create";
    			attr(button, "class", "btn btn-primary");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*createDay*/ ctx[4]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (134:12) {#if blockSlot.status !== Taken}
    function create_if_block$4(ctx) {
    	let creatorblockslot;
    	let current;

    	function clear_handler() {
    		return /*clear_handler*/ ctx[8](/*i*/ ctx[15], /*blockSlot*/ ctx[13]);
    	}

    	creatorblockslot = new CreatorBlockSlot({
    			props: {
    				data: {
    					.../*blockSlot*/ ctx[13],
    					index: /*i*/ ctx[15]
    				},
    				availableBlocks: /*availableBlocks*/ ctx[2]
    			}
    		});

    	creatorblockslot.$on("selected", /*updateSlots*/ ctx[5]);
    	creatorblockslot.$on("clear", clear_handler);

    	return {
    		c() {
    			create_component(creatorblockslot.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(creatorblockslot, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const creatorblockslot_changes = {};

    			if (dirty & /*slots*/ 8) creatorblockslot_changes.data = {
    				.../*blockSlot*/ ctx[13],
    				index: /*i*/ ctx[15]
    			};

    			if (dirty & /*availableBlocks*/ 4) creatorblockslot_changes.availableBlocks = /*availableBlocks*/ ctx[2];
    			creatorblockslot.$set(creatorblockslot_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(creatorblockslot.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(creatorblockslot.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(creatorblockslot, detaching);
    		}
    	};
    }

    // (133:8) {#each slots as blockSlot, i}
    function create_each_block$2(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*blockSlot*/ ctx[13].status !== Taken && create_if_block$4(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*blockSlot*/ ctx[13].status !== Taken) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*slots*/ 8) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let div2;
    	let div0;
    	let t0;
    	let div1;
    	let t1;
    	let label;
    	let t3;
    	let input;
    	let t4;
    	let t5;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = !/*availableBlocks*/ ctx[2].length && /*loaded*/ ctx[0] && create_if_block_2$1();

    	function select_block_type(ctx, dirty) {
    		return create_else_block$2;
    	}

    	let current_block_type = select_block_type();
    	let if_block1 = current_block_type(ctx);
    	let each_value = /*slots*/ ctx[3];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			div2 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			if (if_block0) if_block0.c();
    			t1 = space();
    			label = element("label");
    			label.textContent = "Vibe Day Name";
    			t3 = space();
    			input = element("input");
    			t4 = space();
    			if_block1.c();
    			t5 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(label, "for", "name");
    			attr(input, "name", "name");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div2, t0);
    			append(div2, div1);
    			if (if_block0) if_block0.m(div1, null);
    			append(div1, t1);
    			append(div1, label);
    			append(div1, t3);
    			append(div1, input);
    			set_input_value(input, /*formData*/ ctx[1].name);
    			append(div1, t4);
    			if_block1.m(div1, null);
    			append(div1, t5);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen(input, "input", /*input_input_handler*/ ctx[7]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!/*availableBlocks*/ ctx[2].length && /*loaded*/ ctx[0]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_2$1();
    					if_block0.c();
    					if_block0.m(div1, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty & /*formData*/ 2 && input.value !== /*formData*/ ctx[1].name) {
    				set_input_value(input, /*formData*/ ctx[1].name);
    			}

    			if_block1.p(ctx, dirty);

    			if (dirty & /*slots, availableBlocks, updateSlots, clearSlots, Taken*/ 108) {
    				each_value = /*slots*/ ctx[3];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div1, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			if (if_block0) if_block0.d();
    			if_block1.d();
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    const Available = "available";
    const Selected = "selected";
    const Taken = "taken";

    function instance$5($$self, $$props, $$invalidate) {
    	let $userId;
    	component_subscribe($$self, userId, $$value => $$invalidate(9, $userId = $$value));
    	let loaded = false;
    	let formData = { name: "" };
    	let availableBlocks = [];
    	const possibleHourValues = [...Array(24).keys()];
    	const possibleMinuteValues = [0, 30];
    	let slots = [];

    	for (const hour of possibleHourValues) {
    		for (const minute of possibleMinuteValues) {
    			slots.push({
    				hour,
    				minute,
    				state: Available,
    				block: null,
    				blocksTaken: 0
    			});
    		}
    	}

    	onMount(() => {
    		fetch(`/api/vibechek/users/${$userId}/vibe_blocks`).then(response => response.json()).then(data => {
    			if (data.blocks) {
    				$$invalidate(2, availableBlocks = data.blocks);
    			}

    			$$invalidate(0, loaded = true);
    		}).catch(err => {
    			
    		});
    	});

    	function createDay() {
    		let blocks = [];

    		slots.filter(slot => slot.state === Selected).forEach(slot => {
    			blocks.push(slot);
    		});

    		fetch(`/api/vibechek/users/${$userId}/vibe_days`, {
    			method: "POST",
    			credentials: "include",
    			headers: { "Content-Type": "application/json" },
    			body: JSON.stringify({ dayData: formData, blocks })
    		}).then(response => response.json()).then(data => {
    			if (data.statusCode) {
    				throw data.message;
    			} else {
    				alert("Day created successfully!");
    			}
    		}).catch(err => {
    			
    		});
    	}

    	function updateSlots(event) {
    		let { selectedBlock, index } = event.detail;
    		let oldBlock = { ...slots[index] };
    		let oldSlotState = [];

    		for (let i = 0; i < slots.length; i++) {
    			oldSlotState.push({ ...slots[i] });
    		}

    		clearSlots(index, oldBlock);

    		if (selectedBlock >= 0) {
    			$$invalidate(3, slots[index].state = Selected, slots);
    			$$invalidate(3, slots[index].block = availableBlocks[selectedBlock], slots);
    			$$invalidate(3, slots[index].blocksTaken = client.secondsToBlocks(availableBlocks[selectedBlock].duration), slots);

    			for (let i = index + 1; i < index + slots[index].blocksTaken; i++) {
    				if (slots[i].state === Selected) {
    					clearSlots(i, slots[i]);
    				}

    				$$invalidate(3, slots[i].state = Taken, slots);
    				$$invalidate(3, slots[i].block = null, slots);
    				$$invalidate(3, slots[i].blocksTaken = 0, slots);
    			}

    			$$invalidate(3, slots = [...slots]);
    		}
    	}

    	function clearSlots(index, block) {
    		let oldBlock = { ...block };

    		for (let i = index; i < index + oldBlock.blocksTaken; i++) {
    			$$invalidate(3, slots[i].state = Available, slots);
    			$$invalidate(3, slots[i].block = null, slots);
    			$$invalidate(3, slots[i].blocksTaken = 0, slots);
    		}

    		$$invalidate(3, slots = [...slots]);
    	}

    	function input_input_handler() {
    		formData.name = this.value;
    		$$invalidate(1, formData);
    	}

    	const clear_handler = (i, blockSlot) => {
    		clearSlots(i, blockSlot);
    	};

    	return [
    		loaded,
    		formData,
    		availableBlocks,
    		slots,
    		createDay,
    		updateSlots,
    		clearSlots,
    		input_input_handler,
    		clear_handler
    	];
    }

    class DayCreator extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {});
    	}
    }

    /* src/views/components/creator/PlaylistSearch.svelte generated by Svelte v3.46.4 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	child_ctx[8] = i;
    	return child_ctx;
    }

    // (59:27) 
    function create_if_block_1$1(ctx) {
    	let h2;

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Hit \"Refresh Playlists\" to get your playlists from Spotify!";
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(h2);
    		}
    	};
    }

    // (50:4) {#if playlists.length}
    function create_if_block$3(ctx) {
    	let each_1_anchor;
    	let each_value = /*playlists*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*savePlaylist, playlists*/ 9) {
    				each_value = /*playlists*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (51:8) {#each playlists as playlist, i}
    function create_each_block$1(ctx) {
    	let div;
    	let h3;
    	let t0_value = /*playlist*/ ctx[6].name + "";
    	let t0;
    	let t1;
    	let button;
    	let t3;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[4](/*playlist*/ ctx[6], /*i*/ ctx[8]);
    	}

    	return {
    		c() {
    			div = element("div");
    			h3 = element("h3");
    			t0 = text(t0_value);
    			t1 = space();
    			button = element("button");
    			button.textContent = "Save Playlist";
    			t3 = space();
    			attr(button, "class", "btn btn-primary");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, h3);
    			append(h3, t0);
    			append(div, t1);
    			append(div, button);
    			append(div, t3);

    			if (!mounted) {
    				dispose = listen(button, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*playlists*/ 1 && t0_value !== (t0_value = /*playlist*/ ctx[6].name + "")) set_data(t0, t0_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	let div;
    	let button;
    	let t1;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*playlists*/ ctx[0].length) return create_if_block$3;
    		return create_if_block_1$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			div = element("div");
    			button = element("button");
    			button.textContent = "Refresh Playlists";
    			t1 = space();
    			if_block.c();
    			attr(button, "class", "btn btn-primary");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, button);
    			append(div, t1);
    			if_block.m(div, null);

    			if (!mounted) {
    				dispose = listen(button, "click", /*searchPlaylists*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, null);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $userId;
    	component_subscribe($$self, userId, $$value => $$invalidate(5, $userId = $$value));
    	let playlists = [];
    	let statusMessage = "Loading...";

    	function searchPlaylists() {
    		fetch(`/api/vibechek/users/${$userId}/playlists/spotify`).then(response => response.json()).then(data => {
    			if (data.playlists) {
    				$$invalidate(0, playlists = data.playlists);
    			} else {
    				$$invalidate(1, statusMessage = "You don't have any more playlists to add.");
    			}
    		}).catch(err => {
    			
    		});
    	}

    	function savePlaylist(name, uri, index_to_remove) {
    		fetch(`/api/vibechek/users/${$userId}/playlists`, {
    			method: 'POST',
    			credentials: 'include',
    			headers: { 'Content-Type': 'application/json' },
    			body: JSON.stringify({ name, uri })
    		}).then(response => response.json()).then(data => {
    			$$invalidate(0, playlists = playlists.filter((playlist, playlist_index) => {
    				return playlist_index !== index_to_remove;
    			}));
    		}).catch(err => {
    			
    		});
    	}

    	const click_handler = (playlist, i) => {
    		savePlaylist(playlist.name, playlist.uri, i);
    	};

    	return [playlists, statusMessage, searchPlaylists, savePlaylist, click_handler];
    }

    class PlaylistSearch extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});
    	}
    }

    /* src/views/Creator.svelte generated by Svelte v3.46.4 */

    function create_if_block_3(ctx) {
    	let h1;
    	let t1;
    	let playlistsearch;
    	let current;
    	playlistsearch = new PlaylistSearch({});

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Playlist Search";
    			t1 = space();
    			create_component(playlistsearch.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			mount_component(playlistsearch, target, anchor);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(playlistsearch.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(playlistsearch.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			destroy_component(playlistsearch, detaching);
    		}
    	};
    }

    // (19:40) 
    function create_if_block_2(ctx) {
    	let h1;
    	let t1;
    	let blockcreator;
    	let current;
    	blockcreator = new BlockCreator({});

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Vibe Block Mode";
    			t1 = space();
    			create_component(blockcreator.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			mount_component(blockcreator, target, anchor);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(blockcreator.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(blockcreator.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			destroy_component(blockcreator, detaching);
    		}
    	};
    }

    // (16:38) 
    function create_if_block_1(ctx) {
    	let h1;
    	let t1;
    	let daycreator;
    	let current;
    	daycreator = new DayCreator({});

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Vibe Day Mode";
    			t1 = space();
    			create_component(daycreator.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			mount_component(daycreator, target, anchor);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(daycreator.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(daycreator.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			destroy_component(daycreator, detaching);
    		}
    	};
    }

    // (13:0) {#if $creatorMode === "schedule"}
    function create_if_block$2(ctx) {
    	let h1;
    	let t1;
    	let schedulecreator;
    	let current;
    	schedulecreator = new ScheduleCreator({});

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Schedule Mode";
    			t1 = space();
    			create_component(schedulecreator.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			mount_component(schedulecreator, target, anchor);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(schedulecreator.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(schedulecreator.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			destroy_component(schedulecreator, detaching);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let creatorswitch;
    	let t;
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	creatorswitch = new CreatorSwitch({});
    	const if_block_creators = [create_if_block$2, create_if_block_1, create_if_block_2, create_if_block_3];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$creatorMode*/ ctx[0] === "schedule") return 0;
    		if (/*$creatorMode*/ ctx[0] === "vibe_day") return 1;
    		if (/*$creatorMode*/ ctx[0] === "vibe_block") return 2;
    		if (/*$creatorMode*/ ctx[0] === "playlist_search") return 3;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	return {
    		c() {
    			create_component(creatorswitch.$$.fragment);
    			t = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			mount_component(creatorswitch, target, anchor);
    			insert(target, t, anchor);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(target, anchor);
    			}

    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index !== previous_block_index) {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					}

    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(creatorswitch.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(creatorswitch.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(creatorswitch, detaching);
    			if (detaching) detach(t);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d(detaching);
    			}

    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $creatorMode;
    	component_subscribe($$self, creatorMode, $$value => $$invalidate(0, $creatorMode = $$value));
    	return [$creatorMode];
    }

    class Creator extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});
    	}
    }

    /* src/views/components/common/UserListEntry.svelte generated by Svelte v3.46.4 */

    function create_fragment$2(ctx) {
    	let div;
    	let h3;
    	let t0_value = (/*data*/ ctx[0]?.username || "No Username Provided") + "";
    	let t0;
    	let t1;
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div = element("div");
    			h3 = element("h3");
    			t0 = text(t0_value);
    			t1 = space();
    			button = element("button");
    			button.textContent = "Show User";
    			attr(button, "class", "btn btn-primary");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, h3);
    			append(h3, t0);
    			append(div, t1);
    			append(div, button);

    			if (!mounted) {
    				dispose = listen(button, "click", /*selectUser*/ ctx[1]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*data*/ 1 && t0_value !== (t0_value = (/*data*/ ctx[0]?.username || "No Username Provided") + "")) set_data(t0, t0_value);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { data } = $$props;
    	const dispatch = createEventDispatcher();

    	function selectUser() {
    		dispatch('selected', data);
    	}

    	$$self.$$set = $$props => {
    		if ('data' in $$props) $$invalidate(0, data = $$props.data);
    	};

    	return [data, selectUser];
    }

    class UserListEntry extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { data: 0 });
    	}
    }

    /* src/views/Users.svelte generated by Svelte v3.46.4 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i][0];
    	child_ctx[12] = list[i][1];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[15] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[18] = list[i];
    	return child_ctx;
    }

    function get_each_context_3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[21] = list[i];
    	return child_ctx;
    }

    // (115:8) {#each users as user}
    function create_each_block_3(ctx) {
    	let userlistentry;
    	let current;
    	userlistentry = new UserListEntry({ props: { data: /*user*/ ctx[21] } });
    	userlistentry.$on("selected", /*showUser*/ ctx[6]);

    	return {
    		c() {
    			create_component(userlistentry.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(userlistentry, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const userlistentry_changes = {};
    			if (dirty & /*users*/ 2) userlistentry_changes.data = /*user*/ ctx[21];
    			userlistentry.$set(userlistentry_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(userlistentry.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(userlistentry.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(userlistentry, detaching);
    		}
    	};
    }

    // (135:8) {:else}
    function create_else_block$1(ctx) {
    	let h2;

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "No user selected.";
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(h2);
    		}
    	};
    }

    // (121:8) {#if shownUser}
    function create_if_block$1(ctx) {
    	let h2;
    	let t0_value = /*shownUser*/ ctx[3].username + "";
    	let t0;
    	let t1;
    	let each_1_anchor;
    	let each_value = Object.entries(/*shownUserSchedules*/ ctx[2]);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = text(t0_value);
    			t1 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			append(h2, t0);
    			insert(target, t1, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*shownUser*/ 8 && t0_value !== (t0_value = /*shownUser*/ ctx[3].username + "")) set_data(t0, t0_value);

    			if (dirty & /*daysOfTheWeek, Object, shownUserSchedules, save*/ 148) {
    				each_value = Object.entries(/*shownUserSchedules*/ ctx[2]);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    			if (detaching) detach(t1);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (128:20) {#each schedule[weekDay].blocks as block}
    function create_each_block_2(ctx) {
    	let div;
    	let t0_value = /*block*/ ctx[18].start_hours + "";
    	let t0;
    	let t1;
    	let t2_value = /*block*/ ctx[18].start_minutes + "";
    	let t2;
    	let t3;
    	let t4_value = /*block*/ ctx[18].name + "";
    	let t4;
    	let t5;

    	return {
    		c() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = text(":");
    			t2 = text(t2_value);
    			t3 = text(" - ");
    			t4 = text(t4_value);
    			t5 = space();
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);
    			append(div, t2);
    			append(div, t3);
    			append(div, t4);
    			append(div, t5);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*shownUserSchedules*/ 4 && t0_value !== (t0_value = /*block*/ ctx[18].start_hours + "")) set_data(t0, t0_value);
    			if (dirty & /*shownUserSchedules*/ 4 && t2_value !== (t2_value = /*block*/ ctx[18].start_minutes + "")) set_data(t2, t2_value);
    			if (dirty & /*shownUserSchedules*/ 4 && t4_value !== (t4_value = /*block*/ ctx[18].name + "")) set_data(t4, t4_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (126:16) {#each daysOfTheWeek as weekDay}
    function create_each_block_1(ctx) {
    	let h4;
    	let t0_value = /*weekDay*/ ctx[15] + "";
    	let t0;
    	let t1;
    	let t2_value = /*schedule*/ ctx[12][/*weekDay*/ ctx[15]].name + "";
    	let t2;
    	let t3;
    	let each_1_anchor;
    	let each_value_2 = /*schedule*/ ctx[12][/*weekDay*/ ctx[15]].blocks;
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	return {
    		c() {
    			h4 = element("h4");
    			t0 = text(t0_value);
    			t1 = text(": ");
    			t2 = text(t2_value);
    			t3 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			insert(target, h4, anchor);
    			append(h4, t0);
    			append(h4, t1);
    			append(h4, t2);
    			insert(target, t3, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*shownUserSchedules*/ 4 && t2_value !== (t2_value = /*schedule*/ ctx[12][/*weekDay*/ ctx[15]].name + "")) set_data(t2, t2_value);

    			if (dirty & /*Object, shownUserSchedules, daysOfTheWeek*/ 20) {
    				each_value_2 = /*schedule*/ ctx[12][/*weekDay*/ ctx[15]].blocks;
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_2.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(h4);
    			if (detaching) detach(t3);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (123:12) {#each Object.entries(shownUserSchedules) as [scheduleId, schedule]}
    function create_each_block(ctx) {
    	let h3;
    	let t0;
    	let t1_value = /*schedule*/ ctx[12].name + "";
    	let t1;
    	let t2;
    	let button;
    	let t4;
    	let each_1_anchor;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[9](/*scheduleId*/ ctx[11]);
    	}

    	let each_value_1 = /*daysOfTheWeek*/ ctx[4];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	return {
    		c() {
    			h3 = element("h3");
    			t0 = text("Schedule: ");
    			t1 = text(t1_value);
    			t2 = space();
    			button = element("button");
    			button.textContent = "Save";
    			t4 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    			attr(button, "class", "btn btn-success");
    		},
    		m(target, anchor) {
    			insert(target, h3, anchor);
    			append(h3, t0);
    			append(h3, t1);
    			insert(target, t2, anchor);
    			insert(target, button, anchor);
    			insert(target, t4, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*shownUserSchedules*/ 4 && t1_value !== (t1_value = /*schedule*/ ctx[12].name + "")) set_data(t1, t1_value);

    			if (dirty & /*Object, shownUserSchedules, daysOfTheWeek*/ 20) {
    				each_value_1 = /*daysOfTheWeek*/ ctx[4];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(h3);
    			if (detaching) detach(t2);
    			if (detaching) detach(button);
    			if (detaching) detach(t4);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div2;
    	let div0;
    	let label;
    	let t1;
    	let input;
    	let t2;
    	let button;
    	let t4;
    	let t5;
    	let div1;
    	let h1;
    	let t7;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value_3 = /*users*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	function select_block_type(ctx, dirty) {
    		if (/*shownUser*/ ctx[3]) return create_if_block$1;
    		return create_else_block$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			div2 = element("div");
    			div0 = element("div");
    			label = element("label");
    			label.textContent = "Search for Users:";
    			t1 = space();
    			input = element("input");
    			t2 = space();
    			button = element("button");
    			button.textContent = "Search";
    			t4 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t5 = space();
    			div1 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Users of Vibechek";
    			t7 = space();
    			if_block.c();
    			attr(label, "for", "searchbar");
    			attr(input, "type", "text");
    			attr(button, "class", "btn btn-primary");
    			attr(div0, "class", "sidebar svelte-10j4zkg");
    			attr(div1, "class", "main svelte-10j4zkg");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div0, label);
    			append(div0, t1);
    			append(div0, input);
    			set_input_value(input, /*searchTerm*/ ctx[0]);
    			append(div0, t2);
    			append(div0, button);
    			append(div0, t4);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div0, null);
    			}

    			append(div2, t5);
    			append(div2, div1);
    			append(div1, h1);
    			append(div1, t7);
    			if_block.m(div1, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(input, "input", /*input_input_handler*/ ctx[8]),
    					listen(button, "click", /*search*/ ctx[5])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*searchTerm*/ 1 && input.value !== /*searchTerm*/ ctx[0]) {
    				set_input_value(input, /*searchTerm*/ ctx[0]);
    			}

    			if (dirty & /*users, showUser*/ 66) {
    				each_value_3 = /*users*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3(ctx, each_value_3, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block_3(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div0, null);
    					}
    				}

    				group_outros();

    				for (i = each_value_3.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div1, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_3.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			destroy_each(each_blocks, detaching);
    			if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $userId;
    	component_subscribe($$self, userId, $$value => $$invalidate(10, $userId = $$value));
    	let searchTerm = "";
    	let users = [];
    	let shownUserSchedules = {};
    	let shownUser = null;
    	let daysOfTheWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    	function search() {
    		let search = { user: searchTerm };
    		let searchParams = new URLSearchParams(search);

    		fetch(`/api/vibechek/users?${searchParams.toString()}`).then(response => response.json()).then(data => {
    			$$invalidate(1, users = data.users);
    		}).catch(err => {
    			
    		});
    	}

    	function showUser(event) {
    		let userData = event.detail;

    		fetch(`/api/vibechek/users/${userData.user_id}`).then(response => {
    			if (response.status === 403) {
    				throw "Unauthorized Access";
    			}

    			return response.json();
    		}).then(data => {
    			$$invalidate(2, shownUserSchedules = {});
    			$$invalidate(3, shownUser = data);

    			data.scheduleData.forEach(scheduleElement => {
    				if (!shownUserSchedules.hasOwnProperty(scheduleElement.schedule_id)) {
    					$$invalidate(
    						2,
    						shownUserSchedules[scheduleElement.schedule_id] = {
    							name: scheduleElement.schedule_name,
    							id: scheduleElement.schedule_id
    						},
    						shownUserSchedules
    					);

    					daysOfTheWeek.forEach(day => {
    						$$invalidate(2, shownUserSchedules[scheduleElement.schedule_id][day] = { name: null, blocks: [] }, shownUserSchedules);
    					});
    				}

    				const weekDay = daysOfTheWeek[scheduleElement.day_of_week];
    				$$invalidate(2, shownUserSchedules[scheduleElement.schedule_id][weekDay].name = scheduleElement.vibe_day_name, shownUserSchedules);

    				shownUserSchedules[scheduleElement.schedule_id][weekDay].blocks.push({
    					start: scheduleElement.start_time,
    					name: scheduleElement.vibe_block_name,
    					playlist: scheduleElement.playlist_name,
    					start_hours: client.timePad(client.secondsToHoursAndMinutes(scheduleElement.start_time).hours),
    					start_minutes: client.timePad(client.secondsToHoursAndMinutes(scheduleElement.start_time).minutes)
    				});
    			});
    		}).catch(err => {
    			alert(err);
    		});
    	}

    	function save(schedule) {
    		fetch(`/api/vibechek/users/${$userId}/schedules/saved`, {
    			method: "POST",
    			credentials: "include",
    			headers: { "Content-Type": "application/json" },
    			body: JSON.stringify({ schedule })
    		}).then(response => {
    			if (response.status !== 200) {
    				throw response;
    			}

    			response.json();
    		}).then(data => {
    			alert("Schedule Saved!");
    		}).catch(response => {
    			response.json().then(data => {
    				alert(data.message);
    			}).catch(err => {
    				alert(err);
    			});
    		});
    	}

    	function input_input_handler() {
    		searchTerm = this.value;
    		$$invalidate(0, searchTerm);
    	}

    	const click_handler = scheduleId => {
    		save(scheduleId);
    	};

    	return [
    		searchTerm,
    		users,
    		shownUserSchedules,
    		shownUser,
    		daysOfTheWeek,
    		search,
    		showUser,
    		save,
    		input_input_handler,
    		click_handler
    	];
    }

    class Users extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
    	}
    }

    /* src/views/App.svelte generated by Svelte v3.46.4 */

    function create_else_block(ctx) {
    	let buttonlink;
    	let current;
    	buttonlink = new ButtonLink({ props: { text: "Login", link: "/login" } });

    	return {
    		c() {
    			create_component(buttonlink.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(buttonlink, target, anchor);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(buttonlink.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(buttonlink.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(buttonlink, detaching);
    		}
    	};
    }

    // (33:4) {#if $userId !== "null"}
    function create_if_block(ctx) {
    	let buttonlink0;
    	let t0;
    	let buttonlink1;
    	let t1;
    	let buttonlink2;
    	let t2;
    	let buttonlink3;
    	let t3;
    	let buttonlink4;
    	let current;

    	buttonlink0 = new ButtonLink({
    			props: { text: "Player", link: "/player" }
    		});

    	buttonlink1 = new ButtonLink({
    			props: { text: "Profile", link: "/profiles/me" }
    		});

    	buttonlink2 = new ButtonLink({
    			props: { text: "Creator", link: "/creator" }
    		});

    	buttonlink3 = new ButtonLink({ props: { text: "Users", link: "/users" } });

    	buttonlink4 = new ButtonLink({
    			props: { text: "Logout", link: "/logout" }
    		});

    	return {
    		c() {
    			create_component(buttonlink0.$$.fragment);
    			t0 = space();
    			create_component(buttonlink1.$$.fragment);
    			t1 = space();
    			create_component(buttonlink2.$$.fragment);
    			t2 = space();
    			create_component(buttonlink3.$$.fragment);
    			t3 = space();
    			create_component(buttonlink4.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(buttonlink0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(buttonlink1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(buttonlink2, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(buttonlink3, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(buttonlink4, target, anchor);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(buttonlink0.$$.fragment, local);
    			transition_in(buttonlink1.$$.fragment, local);
    			transition_in(buttonlink2.$$.fragment, local);
    			transition_in(buttonlink3.$$.fragment, local);
    			transition_in(buttonlink4.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(buttonlink0.$$.fragment, local);
    			transition_out(buttonlink1.$$.fragment, local);
    			transition_out(buttonlink2.$$.fragment, local);
    			transition_out(buttonlink3.$$.fragment, local);
    			transition_out(buttonlink4.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(buttonlink0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(buttonlink1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(buttonlink2, detaching);
    			if (detaching) detach(t2);
    			destroy_component(buttonlink3, detaching);
    			if (detaching) detach(t3);
    			destroy_component(buttonlink4, detaching);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let span;
    	let t1;
    	let nav;
    	let current_block_type_index;
    	let if_block;
    	let t2;
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;
    	const if_block_creators = [create_if_block, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$userId*/ ctx[1] !== "null") return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	var switch_value = /*page*/ ctx[0];

    	function switch_props(ctx) {
    		return {};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Vibechek";
    			t1 = space();
    			nav = element("nav");
    			if_block.c();
    			t2 = space();
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    			attr(nav, "class", "svelte-17l2v75");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			insert(target, t1, anchor);
    			insert(target, nav, anchor);
    			if_blocks[current_block_type_index].m(nav, null);
    			insert(target, t2, anchor);

    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index !== previous_block_index) {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(nav, null);
    			}

    			if (switch_value !== (switch_value = /*page*/ ctx[0])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (detaching) detach(t1);
    			if (detaching) detach(nav);
    			if_blocks[current_block_type_index].d();
    			if (detaching) detach(t2);
    			if (detaching) detach(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let $userId;
    	component_subscribe($$self, userId, $$value => $$invalidate(1, $userId = $$value));
    	let page = Login_1;
    	router("/", () => $$invalidate(0, page = SessionCheck));
    	router("/login", () => $$invalidate(0, page = Login_1));
    	router("/player", () => $$invalidate(0, page = Player));
    	router("/profiles/me", () => $$invalidate(0, page = Profile));
    	router("/creator", () => $$invalidate(0, page = Creator));
    	router("/logout", () => $$invalidate(0, page = Logout));
    	router("/users", () => $$invalidate(0, page = Users));
    	router("*", () => $$invalidate(0, page = NotFound));
    	router.start();
    	return [page, $userId];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new App({
      target: document.body,
      props: {},
    });

    return app;

})();
