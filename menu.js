// Menu logic extracted and adapted from Menu.html (no Three.js, no 'i')

// XML Menu Data (full, as in Menu.html)
const xmlString = `<menu>
    <item name="The SciFi BookStore" link="Books/SciFiBookshop.html">
        <item name="The Next Sun">
            <subtitle>Science Fiction - Pioneers reach the first planet from another solar system</subtitle>
        </item>
        <item name="CaveMan Abduction">
            <subtitle>Sci-Fi Comedy - A Flying Saucer crashes near a group of Cave-men</subtitle>
        </item>
        <item name="The AbductoTron Chronicals">
            <subtitle>Sci-Fi Comedy - A Grey gets bored and decides to change things up a bit</subtitle>
        </item>
        <item name="Abduction And Absurdity">
            <subtitle>Sci-Fi Comedy - A Compilation of Sci-Fi Comedies - Just for fun AI Experiments</subtitle>
        </item>
        <item name="The Bue-Harian Chronicals">
            <subtitle>A Science-Fiction Trilogy</subtitle>
            <item name = "MoonRise">
                <subtitle>Science Students trying to Simulate the Universe gone awry</subtitle>
            </item>
            <item name = "Bue-Har'ia">
                <subtitle>Life in the Simulation World</subtitle>
            </item>
            <item name = "Z3R0">
                <subtitle>A New Hero</subtitle>
            </item>
        </item>
    </item>
    <item name="Art By Gerhard" link="Art/Art.html">
        <item name = "Acrylics on Canvas">
            <item name ="Funk Duel">
                <subtitle>1.2m x 0.9m</subtitle>
            </item>
            <item name ="Jazz Trio">
                <subtitle>2m x 1.2m</subtitle>
            </item>
            <item name ="Buskers">
                <subtitle>1.2m x 1m</subtitle>
            </item>
            <item name ="Bassist">
                <subtitle>0.9m x 1.2m</subtitle>
            </item>
            <item name ="Saxophonist">
                <subtitle>0.9m x 1.2m</subtitle>
            </item>
            <item name ="Bass Blues">
                <subtitle>0.9m x 0.9m</subtitle>
            </item>
            <item name ="Sunny In The Shade">
                <subtitle>1.2m x 0.9m</subtitle>
            </item>
            <item name ="Blue Morpho">
                <subtitle>1.2m x 0.9m</subtitle>
            </item>
        </item>
        <item name = "Pov-Ray 3d Renderings">
            <item name = "Funk Duel" />
            <item name = "Bass Still" />
            <item name = "Sunny In The Shade" />
            <item name = "Buskers" />
            <item name = "Jazz Trio" />
            <item name = "Fusion Paint">
                <subtitle>I developed a script in PovRay that would create an impressionistic 3d painting of a 3d Scene</subtitle>
            </item>
            <item name = "3d Paint Experiments">
                <subtitle>I developed a script in PovRay that would create an impressionistic 3d painting of a 3d Scene</subtitle>
            </item>
        </item>
    </item>
    <item name = "GO 3Design" link="go3Design/go3design.html">
        <item name = "Furai-Vision Concept">
            <subtitle>A Rotary Hyper-car Design inspired by the Mazda Furai and the Mazda RX-Vision - Designed in Rhino-3d and converted to Blender-3d</subtitle>
        </item>
        <item name = "Xaena Concept 3">
            <subtitle>Coming Soon TM</subtitle>
        </item>
        <item name = "Quick Concept" />
        <item name = "Concept Mockups" />
    </item>
    <item name = "NX Dev" link="NX_Dev/nx_dev.html">
        <item name = "3d Vehicle Wrap Design">
            <subtitle>Vehicle Wrap design directly onto 3d models </subtitle>
        </item>
        <item name = "3d Paint">
            <subtitle>Concept similar to my Pov-Ray experiments</subtitle>
        </item>
        <item name = "3d + Vector + Raster Designer">
            <subtitle>3d + Vector + Image-Manipulation all-in-one Software. A Concept based on what I first did on the 48k ZX Spectrum</subtitle>
        </item>
    </item>
    <item name = "X-Arcade" link="Arcade/Arcade.html">
        <item name = "Pac-3d" link="Arcade/Pac3d/3dPacMan.html">
            <subtitle>A classic maze game in 3D</subtitle>
        </item>
        <item name = "Escalated Mayhem" link="Arcade/Escalated/escalatedMayhem.html">
            <subtitle>Action game set in a high-rise elevator</subtitle>
        </item>
        <item name = "Pac-Snake" link="Arcade/PacSnake/PacSnake.html">
            <subtitle>A mashup of Pac-Man and Snake</subtitle>
        </item>
        <item name = "Planet Miner" link="Arcade/PlanetMiner/PlanetMiner.html">
            <subtitle>Explore and mine voxel planets</subtitle>
        </item>
        <item name = "Flying Art" link="Arcade/PaintFlyer/PaintFlight.html">
            <subtitle>Fly and Paint in a 3D environment</subtitle>
        </item>
        <item name = "Paint Sim" link="Arcade/Paint/Paint.html">
            <subtitle>A Painting Simulation</subtitle>
        </item>
        <item name = "3d Road-Painter" link="Arcade/trackFlyer/FlyingTracks.html">
            <subtitle>Get behind the wheel and fly away, leaving a road trail</subtitle>
        </item>
    </item>
    <item name = "Contact Me">
        <item name = "Email: nekarx@gmail.com" />
        <item name = "GitHub: github.com/nekarxenos" />
    </item>
</menu>`;

let menuData = null;
let previousRenderedPath = null;
let currentMenuLevel = [];

function parseMenuXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    const menuElement = xmlDoc.querySelector('menu');
    function parseItem(element) {
        const item = {
            name: element.getAttribute('name'),
            link: element.getAttribute('link') || null,
            children: []
        };
        element.querySelectorAll(':scope > item').forEach(child => {
            item.children.push(parseItem(child));
        });
        return item;
    }
    const items = menuElement.querySelectorAll(':scope > item');
    const parsedMenu = { children: [] };
    items.forEach(itemElement => {
        parsedMenu.children.push(parseItem(itemElement));
    });
    return parsedMenu;
}

function renderMenuColumns(currentPath) {
    const wrapper = document.getElementById('menu-columns-wrapper');
    wrapper.innerHTML = '';
    let itemsForNextColumn = menuData.children;
    for (let columnIndex = 0; ; columnIndex++) {
        const column = document.createElement('div');
        column.id = columnIndex === 0 ? 'menu-content' : 'hover-submenu-column';
        itemsForNextColumn.forEach((item, idx) => {
            const menuItem = document.createElement('div');
            menuItem.className = 'menu-item';
            menuItem.textContent = item.name;
            if (currentPath[columnIndex] && currentPath[columnIndex].name === item.name) {
                menuItem.classList.add('current-level');
            }
            // Hover to expand submenu
            menuItem.onmouseenter = (e) => {
                e.stopPropagation();
                // Only re-render if the item has children (submenu)
                if (item.children && item.children.length > 0) {
                    renderMenuColumns([...currentPath.slice(0, columnIndex), item]);
                }
            };
            // Click to follow link (if any)
            menuItem.onclick = (e) => {
                e.stopPropagation();
                if (item.link) {
                    window.location.href = item.link;
                }
            };
            column.appendChild(menuItem);
        });
        wrapper.appendChild(column);
        if (!currentPath[columnIndex] || !currentPath[columnIndex].children || currentPath[columnIndex].children.length === 0) break;
        itemsForNextColumn = currentPath[columnIndex].children;
    }
    previousRenderedPath = [...currentPath];
}

function toggleMenu(show) {
    const menuContainer = document.getElementById('menu-container');
    // Menu is always displayed via CSS. This function now ensures it's rendered, typically to root.
    menuContainer.style.display = 'flex'; // Ensure flex display, in case something else tried to hide it.
    renderMenuColumns([]); // Always render the root level when this function is called.
}

window.addEventListener('DOMContentLoaded', function () {
    menuData = parseMenuXML(xmlString);
    // Menu is always displayed, render it on load.
    renderMenuColumns([]);

    // Prevent default context menu on right-click globally.
    // The original toggleMenu() call here would now reset the menu to root on any right-click.
    // If right-click should specifically interact with the menu (e.g., reset to root),
    // that logic could be added here, for example: currentMenuLevel = []; renderMenuColumns([]);
    window.addEventListener('contextmenu', function (event) {
        event.preventDefault();
    });

    // Clicking outside the menu no longer hides it as it's always visible.
});
