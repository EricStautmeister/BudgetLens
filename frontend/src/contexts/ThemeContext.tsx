// frontend/src/contexts/ThemeContext.tsx - Theme context for managing dark/light mode

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider, Theme } from '@mui/material/styles';
import { apiClient } from '../services/api';

interface ThemeContextType {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    setDarkMode: (darkMode: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

// Light theme configuration
const lightTheme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#1976d2',
        },
        secondary: {
            main: '#dc004e',
        },
        background: {
            default: '#f5f5f5',
            paper: '#ffffff',
        },
        text: {
            primary: '#000000',
            secondary: '#666666',
        },
    },
    typography: {
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                },
            },
        },
        MuiTextField: {
            defaultProps: {
                autoComplete: 'off',
                spellCheck: false,
            },
        },
    },
});

// Dark theme configuration
const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#90caf9',
        },
        secondary: {
            main: '#f48fb1',
        },
        background: {
            default: '#121212',
            paper: '#1e1e1e',
        },
        text: {
            primary: '#ffffff',
            secondary: '#aaaaaa',
        },
    },
    typography: {
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                },
            },
        },
        MuiTextField: {
            defaultProps: {
                autoComplete: 'off',
                spellCheck: false,
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                },
            },
        },
    },
});

interface ThemeProviderProps {
    children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
        // Check localStorage for saved preference first
        const savedTheme = localStorage.getItem('darkMode');
        if (savedTheme !== null) {
            console.log(`Loading theme from localStorage: ${savedTheme}`);
            return JSON.parse(savedTheme);
        }
        // Default to system preference
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        console.log(`Using system theme preference: ${systemDark}`);
        return systemDark;
    });

    const [isLoading, setIsLoading] = useState(true);

    // Load theme preference from API on mount (only if authenticated)
    useEffect(() => {
        const loadThemeFromAPI = async () => {
            // Only try to load from API if user is authenticated
            const token = localStorage.getItem('access_token');
            if (!token) {
                console.log('No auth token found, skipping API theme loading');
                setIsLoading(false);
                return;
            }

            try {
                const response = await apiClient.getSettings();
                console.log('API settings response:', response.data);

                if (response.data && response.data.user && typeof response.data.user.darkMode === 'boolean') {
                    const apiDarkMode = response.data.user.darkMode;
                    const savedTheme = localStorage.getItem('darkMode');
                    const localDarkMode = savedTheme ? JSON.parse(savedTheme) : null;

                    // Only sync if there's a difference and we trust the API has a user-set value
                    // Check if the user actually has preferences saved (not just defaults)
                    const hasUserPreferences = response.data.user.language !== "en" ||
                        response.data.user.currencyFormat !== "CHF ###,###.##" ||
                        response.data.user.dashboardLayout !== "default" ||
                        apiDarkMode === true; // darkMode true is never a default

                    if (hasUserPreferences && localDarkMode !== apiDarkMode) {
                        console.log(`Syncing theme from API: ${apiDarkMode} (local was ${localDarkMode})`);
                        setIsDarkMode(apiDarkMode);
                        localStorage.setItem('darkMode', JSON.stringify(apiDarkMode));
                    } else {
                        console.log(`Keeping local theme setting: ${localDarkMode || isDarkMode}`);
                    }
                } else {
                    console.info('No valid dark mode preference found in API');
                }
            } catch (error) {
                console.info('Could not load theme from API, using local/system preference:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadThemeFromAPI();
    }, []);

    // Save theme preference to localStorage and API whenever it changes
    useEffect(() => {
        localStorage.setItem('darkMode', JSON.stringify(isDarkMode));

        // Save to API (fire and forget, don't block UI) - only if authenticated
        const saveThemeToAPI = async () => {
            // Only try to save to API if user is authenticated
            const token = localStorage.getItem('access_token');
            if (!token) {
                console.log('No auth token found, skipping API theme saving');
                return;
            }

            try {
                // Get current settings first
                const response = await apiClient.getSettings();
                const currentSettings = response.data || {};

                // Update just the dark mode preference
                const updatedSettings = {
                    ...currentSettings,
                    user: {
                        ...currentSettings.user,
                        darkMode: isDarkMode
                    }
                };

                await apiClient.saveSettings(updatedSettings);
            } catch (error) {
                console.info('Could not save theme to API:', error);
            }
        };

        // Only save to API if we're not in the initial loading phase
        if (!isLoading) {
            saveThemeToAPI();
        }
    }, [isDarkMode, isLoading]);

    const toggleDarkMode = () => {
        setIsDarkMode(prev => !prev);
    };

    const setDarkMode = (darkMode: boolean) => {
        setIsDarkMode(darkMode);
    };

    const theme = isDarkMode ? darkTheme : lightTheme;

    const contextValue: ThemeContextType = {
        isDarkMode,
        toggleDarkMode,
        setDarkMode,
    };

    // Always provide the context, even during loading
    return (
        <ThemeContext.Provider value={contextValue}>
            <MuiThemeProvider theme={theme}>
                {children}
            </MuiThemeProvider>
        </ThemeContext.Provider>
    );
};
