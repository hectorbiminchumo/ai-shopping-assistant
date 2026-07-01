import { Metadata } from "next"

import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import SearchTemplate from "@modules/search/templates"

type Params = {
  searchParams: Promise<{
    q?: string
    sortBy?: SortOptions
    page?: string
  }>
  params: Promise<{
    countryCode: string
  }>
}

export const metadata: Metadata = {
  title: "Search",
  description: "Search for products.",
}

export default async function SearchPage(props: Params) {
  const params = await props.params
  const searchParams = await props.searchParams
  const { q, sortBy, page } = searchParams

  return (
    <SearchTemplate
      query={q}
      sortBy={sortBy}
      page={page}
      countryCode={params.countryCode}
    />
  )
}
