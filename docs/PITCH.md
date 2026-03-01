I want to create a fun proof of concept for a web based game which is a small wargame (think total war) but with much simpler simulation. Look at the inpiration in @docs/inpiration.md, I want to have a map battlefiel with some places where there are hills, forest/tress, water/lake/river, mud etc which all have different effects on the units that are moving through them. The game will be realtime, and players will control their 'blocks' of units to move around the map and engage in battles with the enemy.

There are different types of units, such as infantry, cavalry, and archers, each with their own strengths and weaknesses. Players will need to strategically position their units on the battlefield to gain an advantage over their opponents. The game will also include a resource management aspect, where players will need to gather resources to build and upgrade their units.

Graphics are simple, but kind of look like a board game, with a top-down view of the battlefield. The units will be represented as simple shapes or icons, and the terrain will be represented with different colors and textures. The game will have a look of an old-school strategy game, like an old map of roman fights (see inspiration.png for examples).

There is a solo mode where players can play against AI opponents, as well as a multiplayer mode where they can compete against other players online. The game will have a simple and intuitive interface, making it easy for players of all ages to pick up and play.Overall, the goal of this project is to create a fun and engaging web-based wargame.

I want to deploy the game fully statically to github pages, and have players be able to play against each other in real-time using WebRTC for peer-to-peer communication. This will allow for a seamless multiplayer experience without the need for a central server. Use peerjs to handle the WebRTC connections and simplify the implementation of the multiplayer functionality.

Implement the game in typescript, with vite and phaser.js. Focus on it being playable on cellphone in landsacpe mode, but also make sure it works well on desktop browsers. Use responsive design techniques to ensure that the game looks and plays well on different screen sizes.

Keep a good architecture and code quality, with a focus on maintainability and scalability. Use modern web development practices and tools to ensure a smooth development process and a high-quality end product. Different concerns should be in different files and modules, with clear separation of concerns and a modular design. Use a consistent coding style and document the code thoroughly to make it easy for other developers to understand and contribute to the project.

