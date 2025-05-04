exports.handler = async function() {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Função test.js funcionando!",
      timestamp: new Date().toISOString()
    })
  };
} 