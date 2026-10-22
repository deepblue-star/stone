export interface ShippingRegion { province_code: string; province_name: string }
export interface ShippingRegions { regions: ShippingRegion[] }
export interface AddressPayload { address_id: string }
export interface SaveAddressPayload { address_id?: string | null; receiver_name: string; phone: string; province_code: string; city_code: string; city: string; district_code: string; district: string; address_line: string; set_as_default?: boolean }
export interface Address { address_id: string; receiver_name: string; phone: string; province_code: string; province: string; city_code: string; city: string; district_code: string; district: string; address_line: string; is_default: boolean }
export interface AddressBook { addresses: Address[] }
export interface SaveAddressResult { address_id: string; is_default: boolean }
