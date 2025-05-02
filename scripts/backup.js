/**
 * Script para realizar backup manual do banco de dados
 * Uso: npm run backup
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// String de conexão MongoDB
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

async function backupDatabase() {
    try {
        console.log('Iniciando backup do banco de dados...');
        
        // Conectar ao MongoDB
        await client.connect();
        console.log("Conectado ao MongoDB com sucesso!");
        const db = client.db("financas-pro");
        
        // Diretório para salvar backups
        const backupDir = path.join(__dirname, '..', 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
        }
        
        // Nome do arquivo de backup com data e hora
        const date = new Date();
        const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
        const backupFile = path.join(backupDir, `backup-${dateString}.json`);
        
        // Coleções para backup
        const collections = ['users', 'transactions', 'integrations'];
        const backup = {};
        
        // Exportar cada coleção
        for (const collectionName of collections) {
            console.log(`Exportando coleção: ${collectionName}`);
            const data = await db.collection(collectionName).find({}).toArray();
            backup[collectionName] = data;
            console.log(`- ${data.length} documentos exportados`);
        }
        
        // Salvar backup como JSON
        fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
        
        console.log(`Backup concluído: ${backupFile}`);
        
        // Informação adicional sobre tamanho do arquivo
        const stats = fs.statSync(backupFile);
        const fileSizeInMB = stats.size / (1024 * 1024);
        console.log(`Tamanho do arquivo de backup: ${fileSizeInMB.toFixed(2)} MB`);
        
        return backupFile;
    } catch (error) {
        console.error('Erro ao fazer backup do banco de dados:', error);
        throw error;
    } finally {
        // Fechar conexão
        await client.close();
        console.log("Conexão com MongoDB fechada");
    }
}

// Executar backup se este arquivo for executado diretamente
if (require.main === module) {
    backupDatabase()
        .then(backupFile => {
            console.log(`Backup realizado com sucesso: ${backupFile}`);
            process.exit(0);
        })
        .catch(error => {
            console.error('Falha ao realizar backup:', error);
            process.exit(1);
        });
} else {
    // Exportar função para uso em outros scripts
    module.exports = { backupDatabase };
} 