const { Akinator } = require("@aqul/akinator-api");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");

module.exports = {
    name: "akinator",
    description: "Play Akinator - the mind-reading genie!",
    usage: "akinator",
    cooldown: 5,

    async execute(message, args, client) {
        if (message.deletable) {
            message.delete().catch(() => {});
        }

        try {
            const aki = new Akinator({ region: "en", childMode: false });
            await aki.start();

            
            let answers = aki.possibleAnswers || ["Yes", "No", "Don't know", "Probably", "Probably not"];
            if (typeof answers[0] !== 'string') {
                answers = answers.map(a => a.answer || a);
            }
        
            answers = answers.slice(0, 5);

            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle("🧞‍♂️ Akinator")
                .setDescription(`**Question:** ${aki.question}`)
                .addFields({ name: "Progress", value: `${Math.round(aki.progress)}%`, inline: true })
                .setFooter({ text: "Think of a character!" });

            const buttons = answers.map((answer, index) => 
                new ButtonBuilder()
                    .setCustomId(`aki_${index}`)
                    .setLabel(answer)
                    .setStyle(ButtonStyle.Primary)
            );

            const row = new ActionRowBuilder().addComponents(buttons);

            const gameMessage = await message.channel.send({
                embeds: [embed],
                components: [row]
            });

            const collector = gameMessage.createMessageComponentCollector({ 
                time: 300000,
                filter: i => i.user.id === message.author.id
            });

            collector.on('collect', async (interaction) => {
                try {
                    const answerIndex = parseInt(interaction.customId.split('_')[1]);
                    await aki.answer(answerIndex);

             
                    if (aki.isWin) {
                        const winEmbed = new EmbedBuilder()
                            .setColor(0x2ECC71)
                            .setTitle("🎯 I got it!")
                            .setDescription(`**${aki.suggestion?.name || aki.sugestion_name}**\n${aki.suggestion?.description || aki.sugestion_desc || ""}`)
                            .setImage(aki.suggestion?.photo || aki.sugestion_photo)
                            .setFooter({ text: `Found in ${aki.step + 1} questions!` });

                        await interaction.update({
                            embeds: [winEmbed],
                            components: []
                        });
                        
                        collector.stop();
                        return;
                    }

                  
                    let newAnswers = aki.possibleAnswers || ["Yes", "No", "Don't know", "Probably", "Probably not"];
                    if (typeof newAnswers[0] !== 'string') {
                        newAnswers = newAnswers.map(a => a.answer || a);
                    }
                    newAnswers = newAnswers.slice(0, 5);

                    const newEmbed = new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setTitle("🧞‍♂️ Akinator")
                        .setDescription(`**Question:** ${aki.question}`)
                        .addFields({ name: "Progress", value: `${Math.round(aki.progress)}%`, inline: true })
                        .setFooter({ text: `Question ${aki.step + 1}` });

                    const newButtons = newAnswers.map((answer, index) => 
                        new ButtonBuilder()
                            .setCustomId(`aki_${index}`)
                            .setLabel(answer)
                            .setStyle(ButtonStyle.Primary)
                    );

                    const newRow = new ActionRowBuilder().addComponents(newButtons);

                    await interaction.update({
                        embeds: [newEmbed],
                        components: [newRow]
                    });

                } catch (error) {
                    console.error('Akinator error:', error);
                    
                    await interaction.update({
                        content: "❌ Game error occurred! Please try again.",
                        embeds: [],
                        components: []
                    }).catch(() => {
                      
                        interaction.reply({
                            content: "❌ Game error occurred! Please try again.",
                            ephemeral: true
                        }).catch(() => {});
                    });
                    
                    collector.stop();
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    gameMessage.edit({
                        content: "⌛ Game timed out!",
                        embeds: [],
                        components: []
                    }).catch(() => {});
                }
            });

        } catch (error) {
            console.error('Akinator start error:', error);
            return message.channel.send("❌ Failed to start Akinator! Please try again.");
        }
    }
};