import { terrainNoise } from './shaders.js';

/**
 * Initializes a THREE.Material with custom water shader effects.
 * @param {THREE.Material} waterMaterial - The material to be modified.
 * @param {object} waterSettings - An object containing settings for the water effect.
 */
export function initWaterMaterial(waterMaterial, waterSettings) {
    waterMaterial.onBeforeCompile = shader => {
        shader.uniforms.time = { value: 0 };
        shader.uniforms.noiseScale = { value: 2 };
        shader.uniforms.uWaveSpeed = { value: waterSettings.waveSpeed };
        shader.uniforms.uWaveAmplitude = { value: waterSettings.waveAmplitude };
        shader.uniforms.uBlueFreq = { value: waterSettings.blueFreq };
        shader.uniforms.uGreenFreq = { value: waterSettings.greenFreq };

        // Add simplex noise function to both shaders
        shader.vertexShader = terrainNoise + shader.vertexShader;
        shader.fragmentShader = terrainNoise + shader.fragmentShader;

        // Pass noise from vertex to fragment
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `
            #include <common>
            uniform float time;
            uniform float noiseScale;
            varying float vNoise;
            `
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vNoise = ridgedMultifractal(normal * noiseScale);
            `
        );

        // --- Fragment Shader Modifications ---
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `
            #include <common>
            uniform float time;
            uniform float uWaveSpeed;
            uniform float uWaveAmplitude;
            uniform float uBlueFreq;
            uniform float uGreenFreq;
            varying float vNoise;
            `
        );

        // Modify the normal to create the wave effect
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            `
            #include <normal_fragment_maps>

            float t = vNoise;
            float freq = mix(uBlueFreq, uGreenFreq, t);
            float phase = time * uWaveSpeed;
            float wave_height = uWaveAmplitude * sin(vNoise * freq - phase);

            // Use derivatives to calculate the normal from the height field
            vec3 p_dx = dFdx(vViewPosition);
            vec3 p_dy = dFdy(vViewPosition);
            vec2 h_dx = dFdx(vec2(wave_height, 0.0));
            vec2 h_dy = dFdy(vec2(wave_height, 0.0));

            vec3 n = normal;
            n.xy -= vec2(h_dx.x, h_dy.x) * 0.1;

            normal = normalize(n);
            `
        );

        // Modify the color based on depth and wave crests
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            float t_color = vNoise;
            vec3 blue = vec3(0.0, 0.3, 0.8);
            vec3 green = vec3(0.1, 0.8, 0.8);
            vec3 base_color = mix(blue, green, t_color);

            // --- Dynamic Crest Color ---
            // Recalculate the wave sine value to determine the crest
            float freq_crest = mix(uBlueFreq, uGreenFreq, vNoise);
            float phase_crest = time * uWaveSpeed;
            float wave_sine = sin(vNoise * freq_crest - phase_crest); // This value is between -1 and 1

            // Use smoothstep to create a smooth transition to the crest color at the wave peaks.
            float crest_factor = smoothstep(0.5, 1.0, wave_sine);

            // Define the two crest colors
            vec3 sky_blue_crest = vec3(0.529, 0.808, 0.922); // Sky blue for the blue water area
            vec3 white_crest = vec3(1.0, 1.0, 1.0);         // White for the green water area

            // The final crest color is a mix based on the same noise value as the base water color.
            // This ensures the crest color changes in sync with the water color.
            vec3 dynamic_crest_color = mix(sky_blue_crest, white_crest, t_color);

            // Mix the base water color with the dynamic crest color.
            vec3 final_color = mix(base_color, dynamic_crest_color, crest_factor);

            diffuseColor.rgb = final_color;
            `
        );

        waterMaterial.userData.shader = shader;
    };
}