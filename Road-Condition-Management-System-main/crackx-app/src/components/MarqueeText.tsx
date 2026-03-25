import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { COLORS } from '../constants';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface MarqueeTextProps {
    text: string;
    style?: any;
    duration?: number;
}

export default function MarqueeText({ text, style, duration = 15000 }: MarqueeTextProps) {
    const animatedValue = useRef(new Animated.Value(-SCREEN_WIDTH)).current;

    useEffect(() => {
        const startAnimation = () => {
            // Start from LEFT (offscreen negative)
            animatedValue.setValue(-SCREEN_WIDTH);
            Animated.loop(
                Animated.timing(animatedValue, {
                    toValue: SCREEN_WIDTH * 1.5, // Move to RIGHT (positive)
                    duration: duration, // Slower speed (higher duration)
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ).start();
        };

        startAnimation();
    }, [animatedValue, duration]);

    return (
        <View style={styles.container}>
            <Animated.Text
                style={[
                    styles.text,
                    style,
                    { transform: [{ translateX: animatedValue }] }
                ]}
                numberOfLines={1}
            >
                {text}
            </Animated.Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        overflow: 'hidden',
        backgroundColor: '#fff7ed', // Light Orange Background
        paddingVertical: 8,
    },
    text: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.primary,
        width: 1000, // Large width to prevent wrapping
    }
});
