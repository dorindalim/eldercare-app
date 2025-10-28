import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppText from './AppText';

type Activity = {
  title: string;
  description: string;
  etiquette_link: string;
  category: string;
};

type Amenity = {
  title: string;
  description: string;
  image: string;
};

type ParkLocation = {
  title: string;
  url: string;
  image: string;
  region: string;
  hours: string;
  activities: Activity[];
  amenities: Amenity[];
  latitude: number | null;
  longitude: number | null;
  scraped_at: string;
  description?: string | null;
};

type EventItem = {
  id?: string;
  event_id: string;
  title: string;
  description: string | null;
  category: string | null;
  location_name: string | null;
  address: string | null;
  organizer: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  fee: string | null;
  registration_link: string | null;
};

type Props = {
  park?: ParkLocation | null;
  event?: EventItem | null;
  visible: boolean;
  onClose: () => void;
  userLocation: {latitude: number; longitude: number} | null;
  onGetDirections: (item: ParkLocation | EventItem) => void;
  onRegister?: (url?: string | null) => void;
  onSetReminder?: (event: EventItem) => void;
  isScheduled?: (event: EventItem) => boolean;
  distanceMeters: (a: {latitude: number; longitude: number}, b: {latitude: number; longitude: number}) => number;
  kmStr: (m?: number | null) => string;
};

const ItemDetailsModal = ({ 
  park, 
  event, 
  visible, 
  onClose, 
  userLocation, 
  onGetDirections, 
  onRegister,
  onSetReminder,
  isScheduled,
  distanceMeters, 
  kmStr 
}: Props) => {
  const { t } = useTranslation();
  
  const item = park || event;
  if (!item) return null;

  const isEvent = !!(item as EventItem).event_id;
  const eventItem = item as EventItem;
  const parkItem = item as ParkLocation;

  const handleUrlPress = async (url: string) => {
    if (!url) return;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      try {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        }
      } catch (err2) {
        console.error('Failed to open URL:', err2);
      }
    }
  };

  const handleEtiquettePress = async (url: string) => {
    if (!url) return;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      try {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        }
      } catch (err2) {
        console.error('Failed to open etiquette link:', err2);
      }
    }
  };

  const getDistanceText = () => {
    if (!userLocation) return '';
    
    if (isEvent && eventItem.address) {
      return '';
    }
    
    if (!isEvent && parkItem.latitude && parkItem.longitude) {
      const distance = distanceMeters(userLocation, { 
        latitude: parkItem.latitude, 
        longitude: parkItem.longitude 
      });
      return kmStr(distance);
    }
    
    return '';
  };

  const formatTime = (hhmmss?: string | null) => {
    if (!hhmmss) return "";
    const [hStr, mStr] = hhmmss.split(":");
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    const mm = String(m).padStart(2, "0");
    return `${h}${mm !== "00" ? ":" + mm : ""} ${ampm}`;
  };

  const translateActivity = (activityTitle: string) => {
    const activities = t('walking.filters.activities', { returnObjects: true });
    if (typeof activities === 'object' && activities !== null) {
      const matchedKey = Object.keys(activities).find(key => 
        activities[key].toLowerCase() === activityTitle.toLowerCase()
      );
      if (matchedKey) return activities[matchedKey];
      
      const partialMatchKey = Object.keys(activities).find(key => 
        activityTitle.toLowerCase().includes(activities[key].toLowerCase()) ||
        activities[key].toLowerCase().includes(activityTitle.toLowerCase())
      );
      if (partialMatchKey) return activities[partialMatchKey];
    }
    return activityTitle;
  };

  const translateAmenity = (amenityTitle: string) => {
    const amenities = t('walking.filters.amenities', { returnObjects: true });
    if (typeof amenities === 'object' && amenities !== null) {
      const matchedKey = Object.keys(amenities).find(key => 
        amenities[key].toLowerCase() === amenityTitle.toLowerCase()
      );
      if (matchedKey) return amenities[matchedKey];
      
      const partialMatchKey = Object.keys(amenities).find(key => 
        amenityTitle.toLowerCase().includes(amenities[key].toLowerCase()) ||
        amenities[key].toLowerCase().includes(amenityTitle.toLowerCase())
      );
      if (partialMatchKey) return amenities[partialMatchKey];
    }
    return amenityTitle;
  };

  const translateRegion = (regionName: string) => {
    const regions = t('walking.filters.regions', { returnObjects: true });
    if (typeof regions === 'object' && regions !== null) {
      const matchedKey = Object.keys(regions).find(key => 
        regions[key].toLowerCase() === regionName.toLowerCase()
      );
      if (matchedKey) return regions[matchedKey];
      
      const partialMatchKey = Object.keys(regions).find(key => 
        regionName.toLowerCase().includes(regions[key].toLowerCase()) ||
        regions[key].toLowerCase().includes(regionName.toLowerCase())
      );
      if (partialMatchKey) return regions[partialMatchKey];
    }
    return regionName;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <AppText style={styles.closeButtonText}>×</AppText>
          </TouchableOpacity>
          <AppText variant="h2" weight="800" style={styles.title}>
            {isEvent ? t('community.details.title') : t('walking.parkDetails.title')}
          </AppText>
          <View style={styles.placeholder} />
        </View>
        
        <ScrollView style={styles.content}>
          {/* Image */}
          {!isEvent && parkItem.image ? (
            <Image 
              source={{ uri: parkItem.image }} 
              style={styles.itemImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.itemImage, styles.noImage]}>
              <AppText variant="caption" weight="400" style={styles.noImageText}>
                {isEvent ? t('community.details.noImage') : t('walking.parkDetails.noImage')}
              </AppText>
            </View>
          )}

          {/* Title with Distance */}
          <View style={styles.titleSection}>
            <AppText variant="h1" weight="800" style={styles.itemTitle}>
              {item.title}
            </AppText>
            {getDistanceText() && (
              <AppText variant="body" weight="600" style={styles.distanceBadge}>
                {t('walking.location.away', { distance: getDistanceText() })}
              </AppText>
            )}
          </View>

          {/* Event Specific Info */}
          {isEvent && (
            <>
              {/* Location */}
              {eventItem.location_name && (
                <View style={styles.section}>
                  <AppText variant="title" weight="700" style={styles.sectionTitle}>
                    {t('community.details.location')}
                  </AppText>
                  <AppText variant="body" weight="400" style={styles.sectionContent}>
                    {eventItem.location_name}
                  </AppText>
                </View>
              )}

              {/* Date & Time */}
              <View style={styles.section}>
                <AppText variant="title" weight="700" style={styles.sectionTitle}>
                  {t('community.details.dateTime')}
                </AppText>
                <AppText variant="body" weight="400" style={styles.sectionContent}>
                  {eventItem.start_date}
                  {eventItem.start_time && ` · ${formatTime(eventItem.start_time)}`}
                  {eventItem.end_time && ` - ${formatTime(eventItem.end_time)}`}
                </AppText>
              </View>

              {/* Fee */}
              {eventItem.fee && (
                <View style={styles.section}>
                  <AppText variant="title" weight="700" style={styles.sectionTitle}>
                    {t('community.details.fee')}
                  </AppText>
                  <AppText variant="body" weight="400" style={styles.sectionContent}>
                    {eventItem.fee}
                  </AppText>
                </View>
              )}

              {/* Organizer */}
              {eventItem.organizer && (
                <View style={styles.section}>
                  <AppText variant="title" weight="700" style={styles.sectionTitle}>
                    {t('community.details.organizer')}
                  </AppText>
                  <AppText variant="body" weight="400" style={styles.sectionContent}>
                    {eventItem.organizer}
                  </AppText>
                </View>
              )}
            </>
          )}

          {/* Park Specific Info */}
          {!isEvent && (
            <>
              {/* Region */}
              {parkItem.region && (
                <View style={styles.section}>
                  <AppText variant="title" weight="700" style={styles.sectionTitle}>
                    {t('walking.parkDetails.region')}
                  </AppText>
                  <AppText variant="body" weight="400" style={styles.sectionContent}>
                    {translateRegion(parkItem.region)}
                  </AppText>
                </View>
              )}

              {/* Opening Hours */}
              <View style={styles.section}>
                <AppText variant="title" weight="700" style={styles.sectionTitle}>
                  {t('walking.parkDetails.openingHours')}
                </AppText>
                <AppText variant="body" weight="400" style={styles.sectionContent}>
                  {parkItem.hours}
                </AppText>
              </View>

              {/* Activities */}
              {parkItem.activities && parkItem.activities.length > 0 && (
                <View style={styles.section}>
                  <AppText variant="title" weight="700" style={styles.sectionTitle}>
                    {t('walking.parkDetails.activities')} ({parkItem.activities.length})
                  </AppText>
                  <AppText variant="caption" weight="400" style={styles.sectionDescription}>
                    {t('walking.parkDetails.etiquetteGuidelines')}
                  </AppText>

                  <View style={styles.chipsContainer}>
                    {parkItem.activities.map((activity, index) => (
                      <View key={index} style={styles.chip}>
                        <AppText variant="caption" weight="600" style={styles.chipText}>
                          {translateActivity(activity.title)}
                        </AppText>
                        {activity.etiquette_link && (
                          <TouchableOpacity 
                            onPress={() => handleEtiquettePress(activity.etiquette_link)}
                            style={styles.etiquetteIcon}
                          >
                            <AppText>📚</AppText>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Amenities */}
              {parkItem.amenities && parkItem.amenities.length > 0 && (
                <View style={styles.section}>
                  <AppText variant="title" weight="700" style={styles.sectionTitle}>
                    {t('walking.parkDetails.amenities')} ({parkItem.amenities.length})
                  </AppText>
                  <View style={styles.itemsContainer}>
                    {parkItem.amenities.map((amenity, index) => (
                      <View key={index} style={styles.itemCard}>
                        <AppText variant="body" weight="700" style={styles.amenityTitle}>
                          {translateAmenity(amenity.title)}
                        </AppText>
                        {amenity.description && (
                          <AppText variant="caption" weight="400" style={styles.itemDescription}>
                            {amenity.description}
                          </AppText>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          {/* Description */}
          {(isEvent ? eventItem.description : true) && (
            <View style={styles.section}>
              <AppText variant="title" weight="700" style={styles.sectionTitle}>
                {isEvent ? t('community.details.description') : t('walking.parkDetails.description')}
              </AppText>
              <AppText variant="body" weight="400" style={styles.sectionContent}>
                {isEvent ? (eventItem.description || t('community.details.noDescription')) : parkItem.description}
              </AppText>
            </View>
          )}

          {/* Buttons Container */}
          <View style={styles.buttonsContainer}>
            {/* Event-specific buttons */}
            {isEvent && (
              <>
                {/* Register Button */}
                {eventItem.registration_link && onRegister && (
                  <TouchableOpacity 
                    style={styles.registerButton}
                    onPress={() => onRegister(eventItem.registration_link)}
                  >
                    <AppText variant="button" weight="700" style={styles.registerButtonText}>
                      {t('community.register')}
                    </AppText>
                  </TouchableOpacity>
                )}

                {/* Set Reminder Button */}
                {onSetReminder && (
                  <TouchableOpacity 
                    style={[
                      styles.reminderButton,
                      isScheduled && isScheduled(eventItem) && styles.reminderButtonScheduled
                    ]}
                    onPress={() => onSetReminder(eventItem)}
                  >
                    <AppText variant="button" weight="700" style={styles.reminderButtonText}>
                      {isScheduled && isScheduled(eventItem) 
                        ? t('community.notifs.scheduled') 
                        : t('community.notifs.setReminder')
                      }
                    </AppText>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Park-specific buttons */}
            {!isEvent && parkItem.url && (
              <TouchableOpacity 
                onPress={() => handleUrlPress(parkItem.url)}
                style={styles.learnMoreButton}
              >
                <AppText variant="button" weight="700" style={styles.learnMoreButtonText}>
                  {t('walking.parkDetails.learnMore')}
                </AppText>
              </TouchableOpacity>
            )}

            {/* Get Directions Button */}
            <TouchableOpacity 
              style={styles.directionsButton}
              onPress={() => onGetDirections(item)}
            >
              <AppText variant="button" weight="700" style={styles.directionsButtonText}>
                {t(isEvent ? 'community.getDirections' : 'walking.parkDetails.getDirections')}
              </AppText>
            </TouchableOpacity>
          </View>

          {/* Spacer */}
          <View style={styles.spacer} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E7F3FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  chipText: {
    color: '#007AFF',
    fontSize: 12,
  },
  etiquetteIcon: {
    marginLeft: 4,
  },
  sectionDescription: {
    color: '#6B7280',
    fontSize: 14,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
    backgroundColor: '#FFF',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#6C757D',
    fontWeight: '300',
  },
  title: {
    fontSize: 18,
    color: '#2C3E50',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  itemImage: {
    width: '100%',
    height: 250,
  },
  noImage: {
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noImageText: {
    color: '#6C757D',
  },
  titleSection: {
    backgroundColor: '#FFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  itemTitle: {
    fontSize: 24,
    color: '#2C3E50',
    marginBottom: 4,
  },
  distanceBadge: {
    color: '#6C757D',
    fontSize: 16,
  },
  section: {
    backgroundColor: '#FFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  sectionTitle: {
    fontSize: 18,
    color: '#2C3E50',
    marginBottom: 12,
  },
  sectionContent: {
    fontSize: 16,
    color: '#495057',
    lineHeight: 22,
  },
  itemsContainer: {
    gap: 12,
  },
  itemCard: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  amenityTitle: {
    fontSize: 16,
    color: '#2C3E50',
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 14,
    color: '#6C757D',
    lineHeight: 18,
  },
  buttonsContainer: {
    flexDirection: 'column',
    gap: 12,
    margin: 16,
  },
  learnMoreButton: {
    backgroundColor: '#6C757D',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  learnMoreButtonText: {
    color: '#FFF',
    fontSize: 16,
  },
  registerButton: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#FFF',
    fontSize: 16,
  },
  reminderButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  reminderButtonScheduled: {
    backgroundColor: '#6B7280',
  },
  reminderButtonText: {
    color: '#FFF',
    fontSize: 16,
  },
  directionsButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  directionsButtonText: {
    color: '#FFF',
    fontSize: 16,
  },
  spacer: {
    height: 20,
  },
});

export default ItemDetailsModal;