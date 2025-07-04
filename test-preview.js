const { previewPlayer } = require('./server/previewPlayer');

async function testPreviewGeneration() {
  try {
    console.log('Testing preview generation...');
    
    // Test with a sample upload ID (you'll need to replace this with a real one)
    const uploadId = 'test-upload-id';
    
    const preview = await previewPlayer.generatePreview(uploadId, {
      duration: 5,
      quality: 'low',
      format: 'mp4',
      includeAudio: true,
      thumbnail: true
    });
    
    console.log('Preview generated successfully:', preview);
  } catch (error) {
    console.error('Preview generation failed:', error);
  }
}

testPreviewGeneration(); 