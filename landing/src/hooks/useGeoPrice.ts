import { useState, useEffect } from 'react'

export interface GeoPriceData {
  country: string
  currency: string
  symbol: string
  prices: {
    free: number
    pro: number
    elite: number
  }
}

const DEFAULT: GeoPriceData = {
  country: 'US',
  currency: 'USD',
  symbol: '$',
  prices: { free: 0, pro: 9, elite: 24 },
}

export function useGeoPrice(): GeoPriceData {
  const [data, setData] = useState<GeoPriceData>(DEFAULT)

  useEffect(() => {
    fetch('/api/geo-price')
      .then(res => res.json())
      .then((json: GeoPriceData) => setData(json))
      .catch(() => { /* silent fallback — state stays at DEFAULT */ })
  }, [])

  return data
}
