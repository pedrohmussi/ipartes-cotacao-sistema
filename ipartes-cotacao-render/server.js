const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// API Key
const API_KEY = process.env.OPENAI_API_KEY || "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";
const API_URL = "https://api.openai.com/v1/chat/completions";

// MongoDB Connection - Configuração robusta para Render.com
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://infostorequeuerdstation:nkjXzEvMk4dOXBw9@cluster0.lap8tyd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = process.env.DB_NAME || 'ipartes_cotacao';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'suppliers';

let mongoClient;
let db;
let suppliersCollection;

// Conectar ao MongoDB com reconexão automática otimizada para Render
async function connectToMongoDB() {
    try {
        if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected()) {
            console.log('MongoDB já está conectado');
            return true;
        }

        mongoClient = new MongoClient(MONGODB_URI, {
            useUnifiedTopology: true,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 10000,
            maxIdleTimeMS: 30000,
            retryWrites: true,
            w: 'majority'
        });
        
        await mongoClient.connect();
        console.log('✅ Conectado ao MongoDB Atlas com sucesso');
        
        db = mongoClient.db(DB_NAME);
        suppliersCollection = db.collection(COLLECTION_NAME);
        
        // Criar índice para buscas mais rápidas por fabricante
        await suppliersCollection.createIndex({ manufacturer: 1 });
        
        return true;
    } catch (error) {
        console.error('❌ Erro ao conectar ao MongoDB:', error);
        return false;
    }
}

// Função para garantir conexão antes de operações
async function ensureConnection() {
    if (!mongoClient || !mongoClient.topology || !mongoClient.topology.isConnected()) {
        console.log('🔄 Reconectando ao MongoDB...');
        await connectToMongoDB();
    }
}

// Função para obter fornecedores cadastrados do MongoDB
async function getSuppliers() {
    try {
        await ensureConnection();
        
        const suppliers = await suppliersCollection.find({}).toArray();
        console.log(`📋 Encontrados ${suppliers.length} fornecedores no MongoDB`);
        
        // Garantir compatibilidade com formato antigo (email único)
        suppliers.forEach(supplier => {
            if (!supplier.emails && supplier.email) {
                supplier.emails = [supplier.email];
                delete supplier.email;
            } else if (!supplier.emails) {
                supplier.emails = [];
            }
            
            // Converter _id para id se necessário
            if (supplier._id && !supplier.id) {
                supplier.id = supplier._id.toString();
            }
        });
        
        return suppliers;
    } catch (error) {
        console.error('❌ Erro ao ler fornecedores do MongoDB:', error);
        return [];
    }
}

// Função para salvar um novo fornecedor no MongoDB
async function saveSupplier(supplier) {
    try {
        await ensureConnection();
        
        // Garantir que o fornecedor usa o novo formato (emails array)
        if (!supplier.emails && supplier.email) {
            supplier.emails = [supplier.email];
            delete supplier.email;
        } else if (!supplier.emails) {
            supplier.emails = [];
        }
        
        // Adicionar timestamp
        supplier.createdAt = new Date().toISOString();
        supplier.updatedAt = new Date().toISOString();
        
        // Inserir novo fornecedor
        const result = await suppliersCollection.insertOne(supplier);
        console.log('💾 Fornecedor salvo no MongoDB:', result.insertedId);
        
        return result.acknowledged;
    } catch (error) {
        console.error('❌ Erro ao salvar fornecedor no MongoDB:', error);
        return false;
    }
}

// Função para atualizar um fornecedor existente no MongoDB
async function updateSupplier(id, updates) {
    try {
        await ensureConnection();
        
        updates.updatedAt = new Date().toISOString();
        
        const result = await suppliersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );
        
        console.log('✏️ Fornecedor atualizado no MongoDB:', result.modifiedCount);
        return result.modifiedCount > 0;
    } catch (error) {
        console.error('❌ Erro ao atualizar fornecedor no MongoDB:', error);
        return false;
    }
}

// Função para excluir um fornecedor do MongoDB
async function deleteSupplier(id) {
    try {
        await ensureConnection();
        
        const result = await suppliersCollection.deleteOne({ _id: new ObjectId(id) });
        
        console.log('🗑️ Fornecedor excluído do MongoDB:', result.deletedCount);
        return result.deletedCount > 0;
    } catch (error) {
        console.error('❌ Erro ao excluir fornecedor do MongoDB:', error);
        return false;
    }
}

// Função para processar múltiplos produtos
function parseMultipleProducts(productInput) {
    // Dividir por linhas e filtrar linhas vazias
    const lines = productInput.split('\n').filter(line => line.trim().length > 0);
    
    // Se há apenas uma linha, retornar como produto único
    if (lines.length <= 1) {
        return [productInput.trim()];
    }
    
    // Verificar se parece com uma lista de produtos
    const products = [];
    for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Pular linhas que parecem ser cabeçalhos ou separadores
        if (trimmedLine.length < 10 || 
            trimmedLine.toLowerCase().includes('produto') ||
            trimmedLine.toLowerCase().includes('item') ||
            trimmedLine.match(/^[-=]+$/)) {
            continue;
        }
        
        products.push(trimmedLine);
    }
    
    // Se não encontrou produtos válidos, tratar como produto único
    return products.length > 0 ? products : [productInput.trim()];
}

// Rota de health check para Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Sistema de Cotação IPARTES',
        version: '2.0.0'
    });
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para gerar email
app.post('/api/generate-email', async (req, res) => {
    try {
        const { productInput } = req.body;
        
        if (!productInput) {
            return res.status(400).json({ error: 'Dados do produto são obrigatórios' });
        }

        console.log('📧 Gerando email para:', productInput);
        const prompt = `TRANSLATE TO ENGLISH AND CREATE AN EMAIL WITH QUICK SPECS OF ${productInput}`;
        
        const response = await axios.post(API_URL, {
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: `You are an assistant that creates professional quotation emails in English. 
                    Follow this format exactly:
                    
                    Hello Sales Team,
                    
                    I hope this message finds you well.
                    
                    I am reaching out to request a quote for the following items:
                    
                    [QUANTITY] Unit(s) OF [MANUFACTURER] [MODEL/PARTNUMBER] [PRODUCT TYPE]
                    
                    Quick Specifications:
                    [SPEC 1]: [VALUE]
                    [SPEC 2]: [VALUE]
                    [SPEC n]: [VALUE]
                    
                    Please include pricing, lead time, and shipping
                    
                    Shipping Address:
                    SERVER X SYSTEMS
                    10451 NW 28th St, Suite F101
                    Doral, FL 33172, USA
                    
                    Thank you in advance for your assistance. Please let me know if you need any additional information.`
                },
                {
                    role: "user",
                    content: prompt
                }
            ]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        console.log('✅ Email gerado com sucesso');
        res.json({ email: response.data.choices[0].message.content });
    } catch (error) {
        console.error('❌ Erro ao gerar email:', error.response?.data || error.message);
        res.status(500).json({ error: 'Erro ao gerar email' });
    }
});

// Rota para encontrar fornecedores - com suporte a múltiplos produtos
app.post('/api/find-suppliers', async (req, res) => {
    try {
        const { productInput } = req.body;
        
        if (!productInput) {
            return res.status(400).json({ error: 'Dados do produto são obrigatórios' });
        }

        console.log('🔍 Buscando fornecedores para:', productInput);

        // Verificar se há múltiplos produtos
        const products = parseMultipleProducts(productInput);
        console.log(`📦 Detectados ${products.length} produto(s)`);

        const allResults = [];

        for (const product of products) {
            console.log(`⚙️ Processando produto: ${product}`);

            // Prompt melhorado conforme solicitação do usuário
            const prompt = `find the email contact of manufacturer, distributors and resellers from usa and europe of the product below:

${product}`;
            
            let emailList = [];
            
            try {
                const response = await axios.post(API_URL, {
                    model: "gpt-4",
                    messages: [
                        {
                            role: "system",
                            content: `You are a helpful assistant that provides lists of business email addresses.
                            Your task is to find real distributors, manufacturers, and resellers for industrial equipment and provide their contact emails.
                            For each contact, provide their email address in this format:
                            Company Name (Country)
                            Email: contact@example.com
                            
                            Focus on providing real, accurate business emails from USA and Europe.
                            Include manufacturers, authorized distributors, and resellers.
                            Prioritize companies that specifically work with the mentioned product or manufacturer.`
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ]
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_KEY}`
                    }
                });

                const chatGptResponse = response.data.choices[0].message.content;
                console.log('🤖 Resposta do ChatGPT recebida');

                // Extrair emails da resposta do ChatGPT
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const extractedEmails = chatGptResponse.match(emailRegex) || [];
                
                emailList = [...new Set(extractedEmails)]; // Remover duplicatas
                console.log(`📧 Emails extraídos do ChatGPT: ${emailList.length}`);

            } catch (error) {
                console.error('❌ Erro ao consultar ChatGPT:', error.response?.data || error.message);
                emailList = [];
            }

            // Buscar fornecedores cadastrados no MongoDB
            const registeredSuppliers = await getSuppliers();
            console.log(`📋 Fornecedores cadastrados encontrados: ${registeredSuppliers.length}`);
            
            // Coletar todos os emails cadastrados
            let registeredEmails = [];
            registeredSuppliers.forEach(supplier => {
                if (supplier.emails && Array.isArray(supplier.emails)) {
                    registeredEmails = [...registeredEmails, ...supplier.emails];
                }
            });

            // Combinar emails do ChatGPT com emails cadastrados
            const allEmails = [...new Set([...emailList, ...registeredEmails])];

            allResults.push({
                product: product,
                suppliers: allEmails,
                chatGptEmails: emailList,
                registeredEmails: registeredEmails
            });
        }

        // Se há apenas um produto, retornar formato simples
        if (allResults.length === 1) {
            res.json({
                suppliers: allResults[0].suppliers,
                chatGptEmails: allResults[0].chatGptEmails,
                registeredEmails: allResults[0].registeredEmails
            });
        } else {
            // Para múltiplos produtos, retornar formato detalhado
            res.json({
                multipleProducts: true,
                results: allResults,
                totalProducts: allResults.length
            });
        }

    } catch (error) {
        console.error('❌ Erro ao buscar fornecedores:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Erro ao buscar fornecedores',
            message: error.message
        });
    }
});

// Rota para listar todos os fornecedores cadastrados
app.get('/api/suppliers', async (req, res) => {
    try {
        const suppliers = await getSuppliers();
        res.json(suppliers);
    } catch (error) {
        console.error('❌ Erro ao listar fornecedores:', error);
        res.status(500).json({ error: 'Erro ao listar fornecedores' });
    }
});

// Rota para adicionar um novo fornecedor
app.post('/api/suppliers', async (req, res) => {
    try {
        const { manufacturer, email } = req.body;
        
        if (!manufacturer || !email) {
            return res.status(400).json({ error: 'Fabricante e email são obrigatórios' });
        }
        
        const suppliers = await getSuppliers();
        
        // Verificar se já existe um fornecedor com o mesmo fabricante
        const existingSupplier = suppliers.find(s => 
            s.manufacturer.toUpperCase() === manufacturer.toUpperCase()
        );
        
        if (existingSupplier) {
            // Adicionar email ao fornecedor existente se não estiver duplicado
            if (!existingSupplier.emails.includes(email)) {
                existingSupplier.emails.push(email);
                
                await updateSupplier(existingSupplier._id || existingSupplier.id, {
                    emails: existingSupplier.emails
                });
                
                return res.status(200).json(existingSupplier);
            } else {
                return res.status(400).json({ error: 'Este email já está cadastrado para este fabricante' });
            }
        } else {
            // Adicionar novo fornecedor
            const newSupplier = {
                manufacturer,
                emails: [email]
            };
            
            const saved = await saveSupplier(newSupplier);
            
            if (saved) {
                return res.status(201).json(newSupplier);
            } else {
                return res.status(500).json({ error: 'Erro ao salvar fornecedor' });
            }
        }
    } catch (error) {
        console.error('❌ Erro ao adicionar fornecedor:', error);
        res.status(500).json({ error: 'Erro ao adicionar fornecedor' });
    }
});

// Rota para adicionar email a um fornecedor existente
app.post('/api/suppliers/:id/emails', async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email é obrigatório' });
        }
        
        const suppliers = await getSuppliers();
        const supplier = suppliers.find(s => (s._id && s._id.toString() === id) || s.id === id);
        
        if (!supplier) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }
        
        if (!supplier.emails.includes(email)) {
            supplier.emails.push(email);
            
            await updateSupplier(id, {
                emails: supplier.emails
            });
            
            res.json(supplier);
        } else {
            res.status(400).json({ error: 'Este email já está cadastrado para este fornecedor' });
        }
    } catch (error) {
        console.error('❌ Erro ao adicionar email ao fornecedor:', error);
        res.status(500).json({ error: 'Erro ao adicionar email ao fornecedor' });
    }
});

// Rota para remover email de um fornecedor
app.delete('/api/suppliers/:id/emails/:email', async (req, res) => {
    try {
        const { id, email } = req.params;
        
        const suppliers = await getSuppliers();
        const supplier = suppliers.find(s => (s._id && s._id.toString() === id) || s.id === id);
        
        if (!supplier) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }
        
        const emailIndex = supplier.emails.indexOf(decodeURIComponent(email));
        if (emailIndex > -1) {
            supplier.emails.splice(emailIndex, 1);
            
            await updateSupplier(id, {
                emails: supplier.emails
            });
            
            res.json(supplier);
        } else {
            res.status(404).json({ error: 'Email não encontrado para este fornecedor' });
        }
    } catch (error) {
        console.error('❌ Erro ao remover email do fornecedor:', error);
        res.status(500).json({ error: 'Erro ao remover email do fornecedor' });
    }
});

// Rota para excluir um fornecedor
app.delete('/api/suppliers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const deleted = await deleteSupplier(id);
        
        if (deleted) {
            res.json({ message: 'Fornecedor excluído com sucesso' });
        } else {
            res.status(404).json({ error: 'Fornecedor não encontrado' });
        }
    } catch (error) {
        console.error('❌ Erro ao excluir fornecedor:', error);
        res.status(500).json({ error: 'Erro ao excluir fornecedor' });
    }
});

// Inicializar conexão com MongoDB e iniciar servidor
async function startServer() {
    console.log('🚀 Iniciando Sistema de Cotação IPARTES...');
    
    // Conectar ao MongoDB
    const connected = await connectToMongoDB();
    if (!connected) {
        console.error('❌ Falha ao conectar ao MongoDB. Servidor será iniciado sem persistência.');
    }
    
    // Iniciar servidor
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🌐 Sistema disponível em: http://localhost:${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/health`);
        console.log(`💾 MongoDB: ${connected ? 'Conectado' : 'Desconectado'}`);
    });
}

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Recebido SIGTERM. Encerrando servidor graciosamente...');
    if (mongoClient) {
        await mongoClient.close();
        console.log('📴 Conexão MongoDB fechada.');
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Recebido SIGINT. Encerrando servidor graciosamente...');
    if (mongoClient) {
        await mongoClient.close();
        console.log('📴 Conexão MongoDB fechada.');
    }
    process.exit(0);
});

// Iniciar o servidor
startServer();

