module.exports = {
  
    token: "",
    prefix: "!",
    

    nodes: [
        {
            password: "noteninja",
            host: "194.58.66.44",
            port:  6754,
            secure: false,
            identifier: "main-node"
        }
    ],
    
    music: {
        autoplay: true, 
        defaultSearchPlatform: "ytmsearch", 
        defaultVolume: 100,
        maxQueueSize: 100,
        musicardTheme: "classic"  // classic / classicpro / dynamic
        
    },
    
    colors: {
        success: "#00ff00",
        error: "#ff0000",
        info: "#0099ff",
        warning: "#ffcc00",
        primary: "#FF7A00",
        secondary: "#5F2D00",
        background: "#070707",
        text: "#FFFFFF"
    },
    // Emojis
    emojis: {
        play: "▶️",
        pause: "⏸️",
        stop: "⏹️",
        skip: "⏭️",
        previous: "⏮️",
        shuffle: "🔀",
        repeat: "🔁",
        volume: "🔊",
        queue: "📋",
        music: "🎵"
    }
};