import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { XFns, TIMED_OUT } from '../src/index.js'


// a fake channel
//
const Channel = {
    addEventListener: globalThis.addEventListener.bind(globalThis),
    removeEventListener: globalThis.addEventListener.bind(globalThis),
    postMessage: (data) => globalThis.dispatchEvent(new CustomEvent("message", {detail:data})),
}


Deno.test("XFns", async (t) => {
    const xfn1 = (new XFns({fn1: (a,b) => a + b}, Channel, {id:"fn1"}))
    const fn1 = xfn1.proxy
    const fn2 = (new XFns({fn2: (a,b) => a * b}, Channel, {id:"fn2"})).proxy
    const fn3a = (new XFns({fn3: (a,b) => a - b}, Channel, {id:"fn3a"})).proxy
    const fn3b = (new XFns({fn3: (a,b) => a - 2 * b}, Channel, {id:"fn3b"})).proxy

    let fn4Cnt = 0
    const fn4a = (new XFns({fn4: (a) => { fn4Cnt+=a+1 }}, Channel, {id:"fn4a"})).proxy
    const fn4b = (new XFns({fn4: (a) => { fn4Cnt+=a+2 }}, Channel, {id:"fn4b"})).proxy

    await t.step("can call local function", async () => {
        assertEquals(await fn1.fn1(1,2), 3)
    })

    await t.step("can call service accross channel", async () => {
        assertEquals(await fn1.fn2(1,2), 2)
    })

    await t.step("can directly call specific service", async () => {
        assertEquals(await fn1['fn3'](1,2), -1) // this returns first to register
        assertEquals(await fn1['fn3b.fn3'](1,2), -3)
    })

    await t.step("timed-out if not found", async () => {
        try {
            await fn1.fnone(1,2)
        } catch(e) {
            assertEquals(e,TIMED_OUT)
        }
    })

    await t.step("can publish with '!' postfix", () => {
        fn1["fn4!"](2)
        assertEquals(fn4Cnt, 7)

        // publish to specific function
        fn1["fn4b.fn4!"](2)
        assertEquals(fn4Cnt, 11)
    })


    await t.step("discover services while developing", () => {
        fn1.__sync_reg()
        const rs = fn1.__regs
        assertEquals(
            Object.keys(rs).sort(),
            ['fn1', 'fn2', 'fn3a', 'fn3b', 'fn4a', 'fn4b']
        )
    })


})


