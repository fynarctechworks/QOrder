import { useState, useEffect, useCallback, useRef } from 'react';

interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface UseGeolocationReturn {
  position: GeoPosition | null;
  error: string | null;
  loading: boolean;
  /** Re-request the position (e.g. on retry) */
  refresh: () => void;
  /** Get the current position as a simple { latitude, longitude } or null */
  getCoords: () => { latitude: number; longitude: number } | null;
}

/**
 * Hook that requests the browser Geolocation API on mount.
 * Returns the latest position, any error message, and a refresh function.
 *
 * Designed for the QR-order geo-fence feature.
 * - Falls back gracefully: if the API is not available or denied,
 *   the error is stored but the app continues (geo is optional — server decides).
 */
export function useGeolocation(): UseGeolocationReturn {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const watchIdRef = useRef<number | null>(null);

  const requestPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Use getCurrentPosition for a one-shot read; watchPosition for ongoing
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLoading(false);
      },
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('Location permission denied. Please enable location access to order.');
            break;
          case err.POSITION_UNAVAILABLE:
            setError('Location unavailable. Please check your device settings.');
            break;
          case err.TIMEOUT:
            setError('Location request timed out. Please try again.');
            break;
          default:
            setError('Unable to determine your location.');
        }
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000, // accept a cached position up to 1 minute old
      }
    );
  }, []);

  useEffect(() => {
    requestPosition();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [requestPosition]);

  const getCoords = useCallback(() => {
    if (!position) return null;
    return { latitude: position.latitude, longitude: position.longitude };
  }, [position]);

  return { position, error, loading, refresh: requestPosition, getCoords };
}
