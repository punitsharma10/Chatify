// Country calling codes for the phone input (most common first), and E.164 helpers.
export const COUNTRIES = [
  { code : '+91', name : 'India', flag : '🇮🇳' },
  { code : '+1', name : 'United States / Canada', flag : '🇺🇸' },
  { code : '+44', name : 'United Kingdom', flag : '🇬🇧' },
  { code : '+971', name : 'United Arab Emirates', flag : '🇦🇪' },
  { code : '+966', name : 'Saudi Arabia', flag : '🇸🇦' },
  { code : '+974', name : 'Qatar', flag : '🇶🇦' },
  { code : '+965', name : 'Kuwait', flag : '🇰🇼' },
  { code : '+968', name : 'Oman', flag : '🇴🇲' },
  { code : '+973', name : 'Bahrain', flag : '🇧🇭' },
  { code : '+61', name : 'Australia', flag : '🇦🇺' },
  { code : '+64', name : 'New Zealand', flag : '🇳🇿' },
  { code : '+65', name : 'Singapore', flag : '🇸🇬' },
  { code : '+60', name : 'Malaysia', flag : '🇲🇾' },
  { code : '+977', name : 'Nepal', flag : '🇳🇵' },
  { code : '+880', name : 'Bangladesh', flag : '🇧🇩' },
  { code : '+94', name : 'Sri Lanka', flag : '🇱🇰' },
  { code : '+92', name : 'Pakistan', flag : '🇵🇰' },
  { code : '+49', name : 'Germany', flag : '🇩🇪' },
  { code : '+33', name : 'France', flag : '🇫🇷' },
  { code : '+39', name : 'Italy', flag : '🇮🇹' },
  { code : '+34', name : 'Spain', flag : '🇪🇸' },
  { code : '+31', name : 'Netherlands', flag : '🇳🇱' },
  { code : '+81', name : 'Japan', flag : '🇯🇵' },
  { code : '+82', name : 'South Korea', flag : '🇰🇷' },
  { code : '+86', name : 'China', flag : '🇨🇳' },
  { code : '+62', name : 'Indonesia', flag : '🇮🇩' },
  { code : '+63', name : 'Philippines', flag : '🇵🇭' },
  { code : '+27', name : 'South Africa', flag : '🇿🇦' },
  { code : '+234', name : 'Nigeria', flag : '🇳🇬' },
  { code : '+254', name : 'Kenya', flag : '🇰🇪' },
  { code : '+20', name : 'Egypt', flag : '🇪🇬' },
  { code : '+55', name : 'Brazil', flag : '🇧🇷' },
  { code : '+52', name : 'Mexico', flag : '🇲🇽' },
]

// "+91" + "98765 43210" -> "+919876543210"
export const toE164 = (countryCode, number) => {
  const digits = String(number || '').replace(/\D/g, '').replace(/^0+/, '')
  return digits ? `${countryCode}${digits}` : ''
}

export const isValidE164 = (value) => /^\+[1-9]\d{7,14}$/.test(value)

// "+919876543210" -> "+91 98765 43210" (readable display)
export const formatPhone = (e164) => {
  if (!e164) return ''
  const country = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((c) => e164.startsWith(c.code))
  if (!country) return e164
  const rest = e164.slice(country.code.length)
  const grouped = rest.length === 10 ? `${rest.slice(0, 5)} ${rest.slice(5)}` : rest.replace(/(\d{3})(?=\d)/g, '$1 ')
  return `${country.code} ${grouped}`
}

// what to show for a user: email, or phone if they registered with a phone number
export const contactLine = (user) => user?.email || formatPhone(user?.phone) || ''
