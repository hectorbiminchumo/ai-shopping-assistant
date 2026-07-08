import { Metadata } from "next"
import { Suspense } from "react"

import { listCartOptions, retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { getBaseURL } from "@lib/util/env"
import CartMismatchBanner from "@modules/layout/components/cart-mismatch-banner"
import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"
import FreeShippingPriceNudge from "@modules/shipping/components/free-shipping-price-nudge"
import AskVectra from "@modules/home/components/vectra-chat/ask-vectra"
import ScrollReveal from "@modules/common/components/scroll-reveal"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

// Cart-dependent overlays in their own Suspense boundary: these fetches are
// cookie-scoped (uncacheable) and each pays a round trip to Medusa backed by
// a remote database (~0.5-1s). Awaiting them in the layout body blocked the
// document shell — and the LCP — on every single navigation.
async function CartOverlays() {
  const [customer, cart] = await Promise.all([
    retrieveCustomer(),
    retrieveCart(),
  ])

  if (!cart) return null

  const { shipping_options: shippingOptions } = await listCartOptions()

  return (
    <>
      {customer && <CartMismatchBanner customer={customer} cart={cart} />}
      <FreeShippingPriceNudge
        variant="popup"
        cart={cart}
        shippingOptions={shippingOptions}
      />
    </>
  )
}

export default async function PageLayout(props: {
  children: React.ReactNode
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params

  return (
    <>
      <Nav />
      <Suspense fallback={null}>
        <CartOverlays />
      </Suspense>
      {props.children}
      <Footer />
      {/* Streams in after the page: the floating chat button must never
          block the route's first paint on its catalog fetch */}
      <Suspense fallback={null}>
        <AskVectra countryCode={countryCode} />
      </Suspense>
      <ScrollReveal />
    </>
  )
}
