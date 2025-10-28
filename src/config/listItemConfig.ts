export const listItemConfig = {
  parks: {
    placeholderIcon: 'park' as const,
    getMetadata: (t: any, activities: number, amenities: number) => 
      activities > 0 || amenities > 0
        ? t('walking.parks.available', { activities, amenities })
        : t('walking.parks.viewDetails')
  },
  clinics: {
    placeholderIcon: 'local-hospital' as const,
    getMetadata: (t: any, services: number) => 
      services > 0
        ? t('clinics.services.available', { services })
        : t('clinics.viewDetails')
  },
  'community-centres': {
    placeholderIcon: 'account-balance' as const,
    getMetadata: (t: any, activities: number) => 
      activities > 0
        ? t('community.activities.available', { count: activities })
        : t('community.viewDetails')
  },
} as const;