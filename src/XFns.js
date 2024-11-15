import { XMsg, SERVICE_UNAVAILABLE } from './XMsg.js'

/**
 * XFns proxies local functions
 */
export class XFns {
    /**
     * creates a proxy that checks functions else, post message to channel
     * @param {Object} fns hashmap of fucntions
     * @param {Object} channel to post message if not locally found
     * @param {Object} {id}
     */
    constructor(
        fns,
        channel = globalThis,
        {
            id = crypto.randomUUID(),
            timeout = 1000,
            decode = XMsg.decode,
        } = {},
    ) {
        this.id = id
        this.local = fns || {}

        // wraps a channel for messaging
        //
        this.xMsg = new XMsg({
            id,
            channel,
            decode,
            exec:({name, args}) => {

                const ns = name.split('.')
                const [fnId, id] = ns.length===1 ?  [null, ...ns] : ns

                // if incorrect addressed
                //
                if (fnId && fnId!==this.id) {
                    throw SERVICE_UNAVAILABLE
                }

                // prefixed by __ to access object member
                //
                if (id.startsWith('__')) {
                    const m = id.slice(2)
                    if (!(m in this)) {
                        throw SERVICE_UNAVAILABLE
                    }

                    const f = this[m]
                    return typeof(f) === 'function'
                        ? f.apply(this, args)
                        : f
                }

                // check local functions to be executed
                //
                if (id in this.local) {
                    const fn = this.local[id]
                    return typeof(fn) === 'function'
                        ? fn.apply(null, args)
                        : fn
                }

                throw SERVICE_UNAVAILABLE
            }
        })

        // wraps calls to local or remote
        //
        this.proxy = new Proxy(this, {
            get(me, name) {

                // ex: (fn)
                if (typeof(name)==='symbol') {
                    return
                }

                // !-postfix means publish (not waiting for return)
                // ex: fn.remote_name!
                //
                const isPublish = name.endsWith('!')
                if (me.xMsg && isPublish) {
                    return (...args) => {
                        return me.xMsg.publish({
                            name: name.slice(0,-1),
                            args,
                        })
                    }
                }

                // __-prefix to access object member
                // ex: fn.__local
                //
                if (name.startsWith('__')) {
                    const f = me[name.slice(2)]
                    return typeof(f) === 'function'
                        ? f.bind(me)
                        : f
                }

                // check locally defined functions
                // ex: fn.local_name where name is in me.local
                //
                if (name in me.local) {
                    return me.local[name]
                }

                // try remote call
                // ex: fn.remote_name
                //
                if (me.xMsg && !isPublish) {
                    return async (...args) => {
                        return await me.xMsg.post({name, args}, {timeout})
                    }
                }

                throw SERVICE_UNAVAILABLE
            }
        })

        this.regs = {
            [this.id]: Object.keys(this.local || {})
        }
    }

    /**
     * closes the channel and only serve locally
     */
    close() {
        if (this.xMsg) {
            this.xMsg.close()
            delete this.xMsg
        }
    }


    /**
     * synchronized regs for all nodes
     * timing is undeterministic (as it goes through nodes)
     * typically during development to discover various functions
     * @param {*} {callback, from, fs}
     */
    sync_reg({callback, from, fns} = {}) {

        // when received response
        //
        if (from) {
            this.regs[from] = fns || []
            return
        }

        // initiate sync_reg to all
        //
        if (!callback) {
            this.proxy['__sync_reg!']({ callback:`__sync_reg!` })
            return
        }

        // pass local function
        //
        if (callback) {
            this.proxy[callback]({
                from: this.id,
                fns: this.regs[this.id],
            })
            return
        }
    }

}
