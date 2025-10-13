import { Image, Linking, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppText from '../components/AppText';

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
};

type Props = {
  park: ParkLocation | null;
  visible: boolean;
  onClose: () => void;
  userLocation: {latitude: number; longitude: number} | null;
  onGetDirections: (park: ParkLocation) => void;
  distanceMeters: (a: {latitude: number; longitude: number}, b: {latitude: number; longitude: number}) => number;
  kmStr: (m?: number | null) => string;
};

const ParkDetailsModal = ({ park, visible, onClose, userLocation, onGetDirections, distanceMeters, kmStr }: Props) => {
  if (!park) return null;

  const handleUrlPress = async (url: string) => {
    if (!url) return;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('Failed to open URL:', err);
    }
  };

  const handleEtiquettePress = async (url: string) => {
    if (!url) return;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch (err) {
      console.error('Failed to open etiquette link:', err);
    }
  };

  const getDistanceText = () => {
    if (!userLocation || !park.latitude || !park.longitude) return '';
    const distance = distanceMeters(userLocation, { latitude: park.latitude, longitude: park.longitude });
    return kmStr(distance);
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
            Park Details
          </AppText>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content}>
          {/* Park Image */}
          {park.image ? (
            <Image 
              source={{ uri: park.image }} 
              style={styles.parkImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.parkImage, styles.noImage]}>
              <AppText variant="caption" weight="400" style={styles.noImageText}>
                No Image Available
              </AppText>
            </View>
          )}

          {/* Park Title with Distance */}
          <View style={styles.titleSection}>
            <AppText variant="h1" weight="800" style={styles.parkTitle}>
              {park.title}
            </AppText>
            {userLocation && park.latitude && park.longitude && (
              <AppText variant="body" weight="600" style={styles.distanceBadge}>
                ({getDistanceText()} away)
              </AppText>
            )}
          </View>

          {/* Region */}
          {park.region && (
            <View style={styles.section}>
              <AppText variant="title" weight="700" style={styles.sectionTitle}>
                Region
              </AppText>
              <AppText variant="body" weight="400" style={styles.sectionContent}>
                {park.region}
              </AppText>
            </View>
          )}

          {/* Opening Hours */}
          <View style={styles.section}>
            <AppText variant="title" weight="700" style={styles.sectionTitle}>
              Opening Hours
            </AppText>
            <AppText variant="body" weight="400" style={styles.sectionContent}>
              {park.hours}
            </AppText>
          </View>

          {/* Activities */}
          {park.activities && park.activities.length > 0 && (
            <View style={styles.section}>
              <AppText variant="title" weight="700" style={styles.sectionTitle}>
                Activities ({park.activities.length})
              </AppText>
              <View style={styles.itemsContainer}>
                {park.activities.map((activity, index) => (
                  <View key={index} style={styles.itemCard}>
                    <AppText variant="body" weight="700" style={styles.itemTitle}>
                      {activity.title}
                    </AppText>
                    
                    {activity.description && (
                      <AppText variant="caption" weight="400" style={styles.itemDescription}>
                        {activity.description}
                      </AppText>
                    )}
                    {activity.category && (
                      <View style={styles.categoryBadge}>
                        <AppText variant="caption" weight="600" style={styles.categoryText}>
                          {activity.category}
                        </AppText>
                      </View>
                    )}
                    {activity.etiquette_link && (
                      <TouchableOpacity 
                        onPress={() => handleEtiquettePress(activity.etiquette_link)}
                        style={styles.etiquetteLink}
                      >
                        <AppText variant="caption" weight="600" style={styles.etiquetteText}>
                          📚 View Activity Etiquette
                        </AppText>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Amenities */}
          {park.amenities && park.amenities.length > 0 && (
            <View style={styles.section}>
              <AppText variant="title" weight="700" style={styles.sectionTitle}>
                Amenities ({park.amenities.length})
              </AppText>
              <View style={styles.itemsContainer}>
                {park.amenities.map((amenity, index) => (
                  <View key={index} style={styles.itemCard}>
                    {/* Amenity Image */}
                    {amenity.image ? (
                      <Image 
                        source={{ uri: amenity.image }} 
                        style={styles.amenityImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.amenityImage, styles.noAmenityImage]}>
                        <AppText variant="caption" weight="400" style={styles.noImageText}>
                          No Image
                        </AppText>
                      </View>
                    )}
                    <AppText variant="body" weight="700" style={styles.itemTitle}>
                      {amenity.title}
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

          {/* URL */}
          {park.url && (
            <View style={styles.section}>
              <AppText variant="title" weight="700" style={styles.sectionTitle}>
                More Information
              </AppText>
              <TouchableOpacity 
                onPress={() => handleUrlPress(park.url)}
                style={styles.urlButton}
              >
                <AppText variant="body" weight="600" style={styles.urlText}>
                  🔗 Visit NParks Official Page
                </AppText>
              </TouchableOpacity>
            </View>
          )}

          {/* Get Directions Button */}
          <TouchableOpacity 
            style={styles.directionsButton}
            onPress={() => onGetDirections(park)}
          >
            <AppText variant="button" weight="700" style={styles.directionsButtonText}>
              Get Directions
            </AppText>
          </TouchableOpacity>

          {/* Spacer */}
          <View style={styles.spacer} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
  parkImage: {
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
  parkTitle: {
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
  itemTitle: {
    fontSize: 16,
    color: '#2C3E50',
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 14,
    color: '#6C757D',
    lineHeight: 18,
    marginBottom: 8,
  },
  amenityImage: {
    width: '100%',
    height: 120,
    borderRadius: 6,
    marginBottom: 8,
  },
  noAmenityImage: {
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E7F3FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  categoryText: {
    color: '#007AFF',
    fontSize: 12,
  },
  etiquetteLink: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  etiquetteText: {
    color: '#28A745',
    fontSize: 12,
  },
  urlButton: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    alignItems: 'center',
  },
  urlText: {
    color: '#007AFF',
  },
  directionsButton: {
    backgroundColor: '#007AFF',
    margin: 16,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  directionsButtonText: {
    color: '#FFF',
    fontSize: 18,
  },
  spacer: {
    height: 20,
  },
});

export default ParkDetailsModal;