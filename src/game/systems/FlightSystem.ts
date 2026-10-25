/**
 * FlightSystem.ts
 * Central flight infrastructure. Character-specific tuning lives in
 * ./flight/AgathaFlightConfig.ts and ./flight/IronManFlightConfig.ts.
 *
 * The numerical values mirror the previous hard-coded flight behaviour, so
 * wiring the system in does not change balance or feeling.
 */

import * as THREE from 'three';
import {
  CharacterFlightProfile,
} from './flight/AgathaFlightConfig';
import { AGATHA_FLIGHT_PROFILE } from './flight/AgathaFlightConfig';
import { IRONMAN_FLIGHT_PROFILE } from './flight/IronManFlightConfig';
import { VISION_FLIGHT_PROFILE } from './flight/VisionFlightConfig';

export type FlightPowerSet = 'ironman' | 'agatha' | 'vision';

export interface ThrusterLevels {
  foot: number;
  hand: number;
  color: string | null;
}

export class FlightSystem {
  public getProfile(powerSet: FlightPowerSet): CharacterFlightProfile {
    if (powerSet === 'agatha') return AGATHA_FLIGHT_PROFILE;
    if (powerSet === 'vision') return VISION_FLIGHT_PROFILE;
    return IRONMAN_FLIGHT_PROFILE;
  }

  public getTargetAltitude(isFlying: boolean, powerSet: FlightPowerSet): number {
    return isFlying ? this.getProfile(powerSet).hoverHeight : 0;
  }

  public getHoverOffset(isFlying: boolean, powerSet: FlightPowerSet, now: number): number {
    if (!isFlying) return 0;
    const profile = this.getProfile(powerSet);
    return Math.sin(now * profile.hoverFrequency) * profile.hoverAmplitude;
  }

  public dampAltitude(
    current: number,
    target: number,
    powerSet: FlightPowerSet,
    dt: number
  ): number {
    return THREE.MathUtils.damp(current, target, this.getProfile(powerSet).altitudeDamping, dt);
  }

  public getBankLimit(powerSet: FlightPowerSet): number {
    return this.getProfile(powerSet).bankLimit;
  }

  public dampBank(
    current: number,
    turnDifference: number,
    powerSet: FlightPowerSet,
    dt: number
  ): number {
    const profile = this.getProfile(powerSet);
    const target = THREE.MathUtils.clamp(
      -turnDifference * 0.55,
      -profile.bankLimit,
      profile.bankLimit
    );
    return THREE.MathUtils.damp(current, target, profile.bankDamping, dt);
  }

  public dampLevelBank(current: number, powerSet: FlightPowerSet, dt: number): number {
    return THREE.MathUtils.damp(current, 0, this.getProfile(powerSet).bankDamping - 2, dt);
  }

  public getThrusterLevels(options: {
    powerSet: FlightPowerSet;
    isFlying: boolean;
    isDashing: boolean;
    speed: number;
    maxSpeed: number;
    color: string | null;
  }): ThrusterLevels {
    const profile = this.getProfile(options.powerSet);
    if (profile.footThrusterScale === 0 && profile.handThrusterScale === 0) {
      return { foot: 0, hand: 0, color: options.color };
    }

    if (options.isDashing) {
      return {
        foot: profile.dashThrusterScale,
        hand: profile.dashThrusterScale * 0.68,
        color: options.color,
      };
    }

    if (!options.isFlying) {
      return { foot: 0, hand: 0, color: options.color };
    }

    const speedRatio = options.maxSpeed > 0 ? options.speed / options.maxSpeed : 0;
    return {
      foot: profile.footThrusterScale + speedRatio * 0.6,
      hand: profile.handThrusterScale,
      color: options.color,
    };
  }
}

export const flightSystem = new FlightSystem();
